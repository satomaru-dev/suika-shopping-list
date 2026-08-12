import { requireSession } from "@/lib/auth";
import { getProductNames } from "@/lib/data-service";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";
export async function GET() {
  try { const { householdId } = await requireSession(); return Response.json({ names: await getProductNames(householdId) }); }
  catch (error) { return errorResponse(error); }
}
