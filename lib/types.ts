export type ItemSource = "web" | "voice" | "siri" | "import" | "recommendation";

export type ShoppingItem = {
  id: string;
  productId: string;
  name: string;
  originalName: string;
  addedAt: string;
  purchasedAt: string | null;
  source: ItemSource;
};

export type Recommendation = {
  productId: string;
  name: string;
  purchaseDates: string[];
  purchaseCount: number;
  medianIntervalDays: number;
  lastPurchasedAt: string;
  expectedAt: string;
  daysUntilExpected: number;
};

export type MergeCandidate = {
  left: { id: string; name: string };
  right: { id: string; name: string };
  score: number;
  warning?: string;
};

export type MergeHistory = {
  id: string;
  sourceName: string;
  targetName: string;
  mergedAt: string;
};

export type ApiErrorBody = { error: string; code?: string };
