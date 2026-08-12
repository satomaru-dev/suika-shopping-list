import { requireSession } from "@/lib/auth";
import { changeItemProduct, changePurchaseDate, deleteItem, updateItem } from "@/lib/data-service";
import { errorResponse, readJson } from "@/lib/http";
import { z } from "zod";

export const runtime = "nodejs";
const schema = z.union([z.object({ purchased: z.boolean() }), z.object({ productName: z.string().min(1).max(100) }), z.object({ purchasedAt: z.string().datetime({ offset: true }) })]);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { householdId } = await requireSession(); const { id } = await params; const body = schema.parse(await readJson(request)); return Response.json({ item: "productName" in body ? await changeItemProduct(householdId, id, body.productName) : "purchasedAt" in body ? await changePurchaseDate(householdId, id, body.purchasedAt) : await updateItem(householdId, id, body.purchased) }); }
  catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const { householdId } = await requireSession(); const { id } = await params; await deleteItem(householdId, id); return new Response(null, { status: 204 }); }
  catch (error) { return errorResponse(error); }
}
