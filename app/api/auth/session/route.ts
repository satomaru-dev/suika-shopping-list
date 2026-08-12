import { getSetupStatus, logout } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try { return Response.json(await getSetupStatus()); } catch (error) { return errorResponse(error); }
}

export async function DELETE() {
  try { await logout(); return Response.json({ ok: true }); } catch (error) { return errorResponse(error); }
}
