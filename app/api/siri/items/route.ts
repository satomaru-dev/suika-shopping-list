import { addItems, authenticateSiriToken, getProductNames } from "@/lib/data-service";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { splitSpokenItems } from "@/lib/voice";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ text: z.string().min(1).max(300) });

export async function POST(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) throw new HttpError(401, "Siriトークンが必要です。", "INVALID_TOKEN");
    const householdId = await authenticateSiriToken(auth.slice(7));
    const { text } = schema.parse(await readJson(request));
    // Known product names only influence the ambiguous Japanese "と" split.
    // Avoid two unnecessary database round trips for the usual single-item,
    // comma-separated, and newline-separated Siri requests.
    const knownNames = text.includes("\u3068") ? await getProductNames(householdId) : [];
    const names = splitSpokenItems(text, knownNames);
    const items = await addItems(householdId, names, "siri");
    const message = items.length ? `${items.map((item) => item.name).join("、")}を追加しました` : "すでに買い物リストに入っています";
    // Keep the response shape used by the original shortcut while retaining
    // the richer `items` field for the current app.
    const added = items.map((item) => ({ name: item.name }));
    return Response.json({ ok: true, added, items, message });
  } catch (error) { return errorResponse(error); }
}
