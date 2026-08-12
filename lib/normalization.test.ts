import { describe, expect, it } from "vitest";
import { cleanDisplayName, extractProductTypeTokens, findSimilarProductNames, mergeSimilarity, normalizeProductName, normalizeSearchName, searchNameMatches, similarity } from "./normalization";

describe("商品名の正規化", () => {
  it("全角半角・空白・括弧記号をそろえる", () => {
    expect(normalizeProductName(" 牛乳　１０００ｍｌ（低脂肪） ")).toBe("牛乳 1000ml(低脂肪)");
    expect(cleanDisplayName("  キッチン　　ペーパー  ")).toBe("キッチン ペーパー");
  });
  it("容量違いは同一キーにならない", () => {
    expect(normalizeProductName("牛乳 500ml")).not.toBe(normalizeProductName("牛乳 1000ml"));
  });
  it("近い名前には高い類似度を返す", () => {
    expect(similarity("キッチンペーパー", "キッチン ペーパー")).toBeGreaterThan(0.8);
  });
  it("表記だけ違う溶けるチーズを比較できる", () => {
    expect(mergeSimilarity("とけるチーズ", "溶けるチーズ")).toBe(1);
  });
  it("商品種類を区別する", () => {
    expect(extractProductTypeTokens("溶けるスライスチーズ")).toEqual(["スライス", "溶ける"]);
    expect(extractProductTypeTokens("粉チーズ")).toEqual(["粉"]);
  });
  it("読みで砂糖系の商品を検索できる", () => {
    expect(searchNameMatches("さとう", "砂糖")).toBe(true);
    expect(searchNameMatches("さとう", "てんさい糖")).toBe(true);
  });
  it("ひらがなとカタカナを同じ商品として扱う", () => {
    expect(normalizeSearchName("ぱん")).toBe(normalizeSearchName("パン"));
    expect(searchNameMatches("ぱん", "パン")).toBe(true);
  });
  it("基本名が履歴にあれば派生名を候補にしない", () => {
    expect(findSimilarProductNames("牛乳", ["牛乳", "牛乳ヨーグルト用"])).toEqual([]);
    expect(findSimilarProductNames("マスタード", ["粒マスタード"])).toEqual(["粒マスタード"]);
  });
  it("紙製品の種類違いを似た商品にしない", () => {
    expect(searchNameMatches("キッチンペーパー", "トイレットペーパー")).toBe(false);
    expect(searchNameMatches("キッチンペーパー", "ハンドペーパー")).toBe(false);
  });
});
