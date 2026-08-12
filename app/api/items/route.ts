import { requireSession } from "@/lib/auth";
import { addItems, listItems } from "@/lib/data-service";
import { errorResponse, readJson } from "@/lib/http";
import { splitSpokenItems } from "@/lib/voice";
import { z } from "zod";

export const runtime = "nodejs";
const createSchema = z.object({ names: z.array(z.string()).max(20).optional(), text: z.string().optional(), source: z.enum(["web", "voice"]).default("web") });

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
    const { householdId } = await requireSession();
    const body = createSchema.parse(await readJson(request));
    const names = body.names ?? splitSpokenItems(body.text ?? "");
    const items = await addItems(householdId, names, body.source);
    return Response.json({ items, skipped: names.length - items.length }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
