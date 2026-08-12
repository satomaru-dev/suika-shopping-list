import { describe, expect, it } from "vitest";
import { calculateRecommendations, median } from "./recommendations";
import type { ShoppingItem } from "./types";

function purchase(id: string, productId: string, name: string, date: string): ShoppingItem {
  return { id, productId, name, originalName: name, addedAt: date, purchasedAt: date, source: "import" };
}

describe("買い時判定", () => {
  it("中央値を計算する", () => {
    expect(median([10, 30, 20])).toBe(20);
    expect(median([10, 20])).toBe(15);
  });
  it("3回未満は表示しない", () => {
    const items = [purchase("1", "milk", "牛乳", "2026-07-01T12:00:00+09:00"), purchase("2", "milk", "牛乳", "2026-07-11T12:00:00+09:00")];
    expect(calculateRecommendations(items, new Date("2026-07-20T12:00:00+09:00"))).toEqual([]);
  });
  it("予定日が先の商品も表示する", () => {
    const items = ["2026-07-01", "2026-07-11", "2026-07-21"].map((date, index) => purchase(String(index), "milk", "牛乳", `${date}T12:00:00+09:00`));
    expect(calculateRecommendations(items, new Date("2026-07-27T12:00:00+09:00"))[0]).toMatchObject({ name: "牛乳", medianIntervalDays: 10, daysUntilExpected: 4 });
    expect(calculateRecommendations(items, new Date("2026-07-28T12:00:00+09:00"))[0]).toMatchObject({ name: "牛乳", medianIntervalDays: 10, daysUntilExpected: 3 });
  });
  it("同じ商品が未購入リストにあれば表示しない", () => {
    const items = ["2026-07-01", "2026-07-11", "2026-07-21"].map((date, index) => purchase(String(index), "milk", "牛乳", `${date}T12:00:00+09:00`));
    items.push({ id: "pending", productId: "milk", name: "牛乳", originalName: "牛乳", addedAt: "2026-07-28T00:00:00+09:00", purchasedAt: null, source: "web" });
    expect(calculateRecommendations(items, new Date("2026-07-31T12:00:00+09:00"))).toEqual([]);
  });
  it("同日購入は周期計算で一回として扱う", () => {
    const items = [
      purchase("1", "egg", "卵", "2026-07-01T09:00:00+09:00"),
      purchase("2", "egg", "卵", "2026-07-01T18:00:00+09:00"),
      purchase("3", "egg", "卵", "2026-07-08T12:00:00+09:00"),
      purchase("4", "egg", "卵", "2026-07-15T12:00:00+09:00"),
    ];
    expect(calculateRecommendations(items, new Date("2026-07-19T12:00:00+09:00"))[0]).toMatchObject({ purchaseCount: 3, medianIntervalDays: 7 });
  });
});
