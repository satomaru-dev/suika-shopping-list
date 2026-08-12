import { setupHousehold } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ setupSecret: z.string().min(1), pin: z.string(), name: z.string().max(50).optional() });

export async function POST(request: Request) {
  try { const body = schema.parse(await readJson(request)); return Response.json(await setupHousehold(body), { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
