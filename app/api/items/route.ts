import { requireSession } from "@/lib/auth";
import { addItems, authenticateSiriToken, listItems } from "@/lib/data-service";
import { errorResponse, readJson } from "@/lib/http";
import { splitSpokenItems } from "@/lib/voice";
import { z } from "zod";

export const runtime = "nodejs";
const createSchema = z.object({ names: z.array(z.string()).max(20).optional(), text: z.string().optional(), source: z.enum(["web", "voice"]).default("web") });
const siriCreateSchema = z.object({
  text: z.string().min(1).max(300).optional(),
  items: z.array(z.object({ name: z.string().min(1).max(100) })).max(20).optional(),
}).refine((body) => body.text || body.items?.length, { message: "商品名が必要です" });

export async function GET(request: Request) {
  try {
    const { householdId } = await requireSession();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") === "purchased" ? "purchased" : "pending";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 500);
    return Response.json({ items: await listItems(householdId, status, limit) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    if (authorization.startsWith("Bearer ")) {
      const startedAt = Date.now();
      const householdId = await authenticateSiriToken(authorization.slice(7));
      const body = siriCreateSchema.parse(await readJson(request));
      const names = body.items?.map((item) => item.name) ?? splitSpokenItems(body.text ?? "");
      const items = await addItems(householdId, names, "siri");
      console.info("[siri-compat] completed", { authMs: Date.now() - startedAt, totalMs: Date.now() - startedAt });
      const message = items.length ? `${items.map((item) => item.name).join("、")}を追加しました` : "すでに買い物リストに入っています";
      return Response.json({ ok: true, added: items.map((item) => ({ name: item.name })), message });
    }
    const { householdId } = await requireSession();
    const body = createSchema.parse(await readJson(request));
    const names = body.names ?? splitSpokenItems(body.text ?? "");
    const items = await addItems(householdId, names, body.source);
    return Response.json({ items, skipped: names.length - items.length }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
