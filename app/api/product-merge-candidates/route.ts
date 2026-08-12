import { requireSession } from "@/lib/auth";
import { getMergeCandidates } from "@/lib/data-service";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function GET() {
  try { const { householdId } = await requireSession(); return Response.json({ candidates: await getMergeCandidates(householdId) }); }
  catch (error) { return errorResponse(error); }
}
