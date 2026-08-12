import { describe, expect, it } from "vitest";
import { splitSpokenItems } from "./voice";

describe("音声の商品分割", () => {
  it("読点と接続詞で複数商品へ分ける", () => {
    expect(splitSpokenItems("牛乳と卵とパン", ["牛乳", "卵", "パン"])).toEqual(["牛乳", "卵", "パン"]);
    expect(splitSpokenItems("牛乳、卵, パン")).toEqual(["牛乳", "卵", "パン"]);
  });
  it("砂糖を誤って分割しない", () => {
    expect(splitSpokenItems("さとう")).toEqual(["さとう"]);
  });
  it("同じ商品は一度だけ返す", () => {
    expect(splitSpokenItems("牛乳、牛乳")).toEqual(["牛乳"]);
  });
});
