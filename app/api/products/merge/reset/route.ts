import { requireSession } from "@/lib/auth";
import { resetMerges } from "@/lib/data-service";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function POST() {
  try { const { householdId } = await requireSession(); await resetMerges(householdId); return Response.json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
