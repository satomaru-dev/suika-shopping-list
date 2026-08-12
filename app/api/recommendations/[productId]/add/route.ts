import { requireSession } from "@/lib/auth";
import { addItems, getRecommendations } from "@/lib/data-service";
import { errorResponse, HttpError } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(_request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const { householdId } = await requireSession(); const { productId } = await params;
    const recommendation = (await getRecommendations(householdId)).find((entry) => entry.productId === productId);
    if (!recommendation) throw new HttpError(404, "候補が見つかりません。", "NOT_FOUND");
    const items = await addItems(householdId, [recommendation.name], "recommendation");
    return Response.json({ items }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
