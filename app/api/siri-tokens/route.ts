import { requireSession } from "@/lib/auth";
import { createSiriToken, listSiriTokens, revokeSiriToken } from "@/lib/data-service";
import { errorResponse, readJson } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
const createSchema = z.object({ label: z.string().max(50).default("iPhone") });
const deleteSchema = z.object({ id: z.string().uuid() });

export async function GET() {
  try { const { householdId } = await requireSession(); return Response.json({ tokens: await listSiriTokens(householdId) }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { const { householdId } = await requireSession(); const { label } = createSchema.parse(await readJson(request)); return Response.json(await createSiriToken(householdId, label), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request) {
  try { const { householdId } = await requireSession(); const { id } = deleteSchema.parse(await readJson(request)); await revokeSiriToken(householdId, id); return new Response(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
