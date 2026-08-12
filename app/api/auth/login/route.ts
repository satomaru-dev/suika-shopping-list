import { login, requestIp } from "@/lib/auth";
import { errorResponse, readJson } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.object({ pin: z.string() });

export async function POST(request: Request) {
  try { const { pin } = schema.parse(await readJson(request)); return Response.json(await login(pin, requestIp(request))); }
  catch (error) { return errorResponse(error); }
}
