import type { Recommendation, ShoppingItem } from "./types";

const DAY_MS = 86_400_000;

function toJstDateKey(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

function dayNumber(key: string): number {
  return Date.parse(`${key}T00:00:00+09:00`) / DAY_MS;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calculateRecommendations(items: ShoppingItem[], now = new Date()): Recommendation[] {
  const pendingProducts = new Set(items.filter((item) => !item.purchasedAt).map((item) => item.productId));
  const grouped = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    if (!item.purchasedAt || new Date(item.purchasedAt) > now) continue;
    grouped.set(item.productId, [...(grouped.get(item.productId) ?? []), item]);
  }

  const todayKey = toJstDateKey(now.toISOString());
  const today = dayNumber(todayKey);
  const recommendations: Recommendation[] = [];

  for (const [productId, purchases] of grouped) {
    if (pendingProducts.has(productId)) continue;
    const dates = Array.from(new Set(purchases.map((item) => toJstDateKey(item.purchasedAt!)))).sort();
    if (dates.length < 3) continue;
    const intervals = dates.slice(1).map((date, index) => dayNumber(date) - dayNumber(dates[index])).filter((days) => days > 0);
    if (intervals.length < 2) continue;
    const medianDays = median(intervals);
    const expectedDay = dayNumber(dates.at(-1)!) + medianDays;
    const reference = purchases.at(-1)!;
    recommendations.push({
      productId,
      name: reference.name,
      purchaseDates: [...dates].reverse(),
      purchaseCount: dates.length,
      medianIntervalDays: medianDays,
      lastPurchasedAt: `${dates.at(-1)}T00:00:00+09:00`,
      expectedAt: new Date(expectedDay * DAY_MS).toISOString(),
      daysUntilExpected: Math.ceil(expectedDay - today),
    });
  }

  return recommendations.sort((a, b) => b.daysUntilExpected - a.daysUntilExpected || b.name.localeCompare(a.name, "ja"));
}
