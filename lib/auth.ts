import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { cookies } from "next/headers";
import { isDemoMode } from "./env";
import { HttpError } from "./http";
import { getSupabaseAdmin } from "./supabase";
import { randomToken, sha256 } from "./crypto";

const COOKIE_NAME = "suika_session";
const SESSION_DAYS = 30;

export async function hashPin(pin: string): Promise<string> {
  return hash(pin, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 });
}

export function validatePin(pin: string): void {
  if (!/^\d{4,12}$/.test(pin)) throw new HttpError(400, "PINは4〜12桁の数字で入力してください。", "INVALID_PIN");
}

export async function getSession(): Promise<{ householdId: string; demo: boolean } | null> {
  if (isDemoMode()) return { householdId: "demo-household", demo: true };
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("sessions").select("household_id,expires_at").eq("token_hash", sha256(token)).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at) <= new Date()) return null;
  return { householdId: data.household_id, demo: false };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new HttpError(401, "ログインしてください。", "UNAUTHORIZED");
  return session;
}

export async function setupHousehold(input: { setupSecret: string; pin: string; name?: string }) {
  if (isDemoMode()) return { ok: true };
  validatePin(input.pin);
  const expected = process.env.APP_SETUP_SECRET;
  if (!expected || input.setupSecret !== expected) throw new HttpError(403, "セットアップ用の合言葉が違います。", "INVALID_SETUP_SECRET");
  const supabase = getSupabaseAdmin();
  const { count, error: countError } = await supabase.from("households").select("id", { count: "exact", head: true });
  if (countError) throw countError;
  if ((count ?? 0) > 0) throw new HttpError(409, "初回設定は完了しています。", "ALREADY_SETUP");
  const { error } = await supabase.from("households").insert({ name: input.name?.trim() || "わが家", pin_hash: await hashPin(input.pin) });
  if (error) throw error;
  return { ok: true };
}

export async function getSetupStatus() {
  if (isDemoMode()) return { authenticated: true, setupRequired: false, demo: true };
  const session = await getSession();
  const supabase = getSupabaseAdmin();
  const { count, error } = await supabase.from("households").select("id", { count: "exact", head: true });
  if (error) throw error;
  return { authenticated: Boolean(session), setupRequired: (count ?? 0) === 0, demo: false };
}

export async function login(pin: string, ip: string) {
  if (isDemoMode()) return { ok: true };
  validatePin(pin);
  const supabase = getSupabaseAdmin();
  const ipHash = sha256(ip || "unknown");
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { count, error: attemptError } = await supabase.from("login_attempts").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).eq("success", false).gte("attempted_at", since);
  if (attemptError) throw attemptError;
  if ((count ?? 0) >= 5) throw new HttpError(429, "失敗が続いたため15分待ってからお試しください。", "RATE_LIMITED");

  const { data: household, error } = await supabase.from("households").select("id,pin_hash").limit(1).maybeSingle();
  if (error) throw error;
  if (!household) throw new HttpError(409, "先に初回設定を行ってください。", "SETUP_REQUIRED");
  const valid = await verify(household.pin_hash, pin);
  await supabase.from("login_attempts").insert({ ip_hash: ipHash, success: valid });
  if (!valid) throw new HttpError(401, "PINが違います。", "INVALID_PIN");

  await supabase.from("login_attempts").delete().eq("ip_hash", ipHash);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const { error: sessionError } = await supabase.from("sessions").insert({ household_id: household.id, token_hash: sha256(token), expires_at: expiresAt.toISOString() });
  if (sessionError) throw sessionError;
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
  return { ok: true };
}

export async function logout() {
  if (isDemoMode()) return;
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) await getSupabaseAdmin().from("sessions").delete().eq("token_hash", sha256(token));
  cookieStore.delete(COOKIE_NAME);
}

export function requestIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}
