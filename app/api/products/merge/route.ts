import { requireSession } from "@/lib/auth";
import { mergeProducts } from "@/lib/data-service";
import { errorResponse, readJson } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ sourceId: z.string().uuid(), targetId: z.string().uuid() });
export async function POST(request: Request) {
  try { const { householdId } = await requireSession(); const body = schema.parse(await readJson(request)); await mergeProducts(householdId, body.sourceId, body.targetId); return Response.json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
