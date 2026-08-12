import history from "@/data/purchase-history.json";
import { calculateRecommendations } from "./recommendations";
import { cleanDisplayName, normalizeProductName, mergeSimilarity, extractProductTypeTokens, extractSizeTokens } from "./normalization";
import type { ItemSource, MergeCandidate, MergeHistory, ShoppingItem } from "./types";

type Product = { id: string; name: string; normalizedName: string };
type DemoState = { products: Product[]; items: ShoppingItem[]; siriTokens: { id: string; label: string; createdAt: string }[]; mergeHistory: MergeHistory[] };

declare global { var __suikaDemoState: DemoState | undefined; }

function buildState(): DemoState {
  const products: Product[] = [];
  const byName = new Map<string, Product>();
  const items: ShoppingItem[] = [];
  for (const row of history as { rowNumber: number; name: string; purchasedAt: string }[]) {
    const normalizedName = normalizeProductName(row.name);
    let product = byName.get(normalizedName);
    if (!product) {
      product = { id: crypto.randomUUID(), name: cleanDisplayName(row.name), normalizedName };
      products.push(product);
      byName.set(normalizedName, product);
    }
    items.push({ id: crypto.randomUUID(), productId: product.id, name: product.name, originalName: row.name, addedAt: row.purchasedAt, purchasedAt: row.purchasedAt, source: "import" });
  }
  const state = { products, items, siriTokens: [], mergeHistory: [] as MergeHistory[] };
  for (const name of ["牛乳", "卵", "キッチンペーパー"]) demoAddItems(state, [name], "web");
  return state;
}

export function getDemoState(): DemoState {
  globalThis.__suikaDemoState ??= buildState();
  globalThis.__suikaDemoState.mergeHistory ??= [];
  return globalThis.__suikaDemoState;
}

function demoAddItems(state: DemoState, names: string[], source: ItemSource) {
  const added: ShoppingItem[] = [];
  for (const rawName of names) {
    const name = cleanDisplayName(rawName);
    const normalizedName = normalizeProductName(name);
    if (!normalizedName) continue;
    let product = state.products.find((entry) => entry.normalizedName === normalizedName);
    if (!product) {
      product = { id: crypto.randomUUID(), name, normalizedName };
      state.products.push(product);
    }
    if (state.items.some((item) => item.productId === product!.id && !item.purchasedAt)) continue;
    const item: ShoppingItem = { id: crypto.randomUUID(), productId: product.id, name: product.name, originalName: name, addedAt: new Date().toISOString(), purchasedAt: null, source };
    state.items.unshift(item);
    added.push(item);
  }
  return added;
}

export const demoStore = {
  listItems(status: "pending" | "purchased") {
    return getDemoState().items.filter((item) => status === "pending" ? !item.purchasedAt : Boolean(item.purchasedAt)).sort((a, b) => (b.purchasedAt ?? b.addedAt).localeCompare(a.purchasedAt ?? a.addedAt));
  },
  addItems(names: string[], source: ItemSource) { return demoAddItems(getDemoState(), names, source); },
  updateItem(id: string, purchased: boolean) {
    const state = getDemoState();
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return null;
    if (!purchased && state.items.some((entry) => entry.id !== id && entry.productId === item.productId && !entry.purchasedAt)) throw new Error("ALREADY_PENDING");
    item.purchasedAt = purchased ? new Date().toISOString() : null;
    return item;
  },
  changeItemProduct(id: string, productName: string) {
    const state = getDemoState();
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return null;
    const name = cleanDisplayName(productName);
    const normalizedName = normalizeProductName(name);
    let product = state.products.find((entry) => entry.normalizedName === normalizedName);
    if (!product) {
      product = { id: crypto.randomUUID(), name, normalizedName };
      state.products.push(product);
    }
    item.productId = product.id;
    item.name = product.name;
    item.originalName = product.name;
    return item;
  },
  changePurchaseDate(id: string, purchasedAt: string) {
    const item = getDemoState().items.find((entry) => entry.id === id);
    if (!item) return null;
    item.purchasedAt = purchasedAt;
    item.addedAt = item.addedAt || purchasedAt;
    return item;
  },
  deleteItem(id: string) {
    const state = getDemoState();
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) return false;
    state.items.splice(index, 1);
    return true;
  },
  recommendations() {
    const date = process.env.DEMO_TODAY ? new Date(`${process.env.DEMO_TODAY}T12:00:00+09:00`) : new Date();
    return calculateRecommendations(getDemoState().items, date);
  },
  productNames() {
    const state = getDemoState();
    const activeIds = new Set(state.items.map((item) => item.productId));
    return state.products.filter((product) => activeIds.has(product.id)).map((product) => product.name);
  },
  mergeCandidates(): MergeCandidate[] {
    const state = getDemoState();
    const activeIds = new Set(state.items.map((item) => item.productId));
    const products = state.products.filter((product) => activeIds.has(product.id));
    const result: MergeCandidate[] = [];
    for (let i = 0; i < products.length; i += 1) for (let j = i + 1; j < products.length; j += 1) {
      const leftTypes = extractProductTypeTokens(products[i].name);
      const rightTypes = extractProductTypeTokens(products[j].name);
      const sharedType = leftTypes.length === 0 || rightTypes.length === 0 || leftTypes.some((type) => rightTypes.includes(type));
      const overlappingType = leftTypes.length > 0 && rightTypes.length > 0 && leftTypes.some((type) => rightTypes.includes(type));
      const differentCoreCategory = products[i].name.includes("チーズ") !== products[j].name.includes("チーズ");
      const score = mergeSimilarity(products[i].name, products[j].name);
      if (!differentCoreCategory && sharedType && (score >= 0.72 || (overlappingType && score >= 0.5)) && normalizeProductName(products[i].name) !== normalizeProductName(products[j].name)) {
        const sizesDiffer = extractSizeTokens(products[i].name).join() !== extractSizeTokens(products[j].name).join();
        const typesDiffer = leftTypes.join() !== rightTypes.join();
        const warnings = [typesDiffer ? "商品種類が異なる可能性があります" : undefined, sizesDiffer ? "容量・個数が異なる可能性があります" : undefined].filter(Boolean);
        result.push({ left: { id: products[i].id, name: products[i].name }, right: { id: products[j].id, name: products[j].name }, score, warning: warnings.join("。") || undefined });
      }
    }
    return result.sort((a, b) => b.score - a.score).slice(0, 30);
  },
  mergeProducts(sourceId: string, targetId: string) {
    const state = getDemoState();
    const source = state.products.find((product) => product.id === sourceId);
    const target = state.products.find((product) => product.id === targetId);
    if (!source || !target) return false;
    getDemoState().mergeHistory.unshift({ id: crypto.randomUUID(), sourceName: source.name, targetName: target.name, mergedAt: new Date().toISOString() });
    const targetHasPending = state.items.some((item) => item.productId === targetId && !item.purchasedAt);
    if (targetHasPending) state.items = state.items.filter((item) => !(item.productId === sourceId && !item.purchasedAt));
    state.items.forEach((item) => { if (item.productId === sourceId) { item.productId = targetId; item.name = target.name; } });
    state.products = state.products.filter((product) => product.id !== sourceId);
    return true;
  },
  mergeHistory() { return getDemoState().mergeHistory; },
  resetMerges() {
    const state = getDemoState();
    const products: Product[] = [];
    const byName = new Map<string, Product>();
    for (const item of state.items) {
      const sourceName = item.name;
      const normalizedName = normalizeProductName(sourceName);
      if (!normalizedName) continue;
      let product = byName.get(normalizedName);
      if (!product) {
        product = { id: crypto.randomUUID(), name: cleanDisplayName(sourceName), normalizedName };
        products.push(product);
        byName.set(normalizedName, product);
      }
      item.productId = product.id;
      item.name = product.name;
    }
    state.products = products;
    state.mergeHistory = [];
  },
  createSiriToken(label: string) {
    const entry = { id: crypto.randomUUID(), label: label.trim() || "iPhone", createdAt: new Date().toISOString() };
    getDemoState().siriTokens.unshift(entry);
    return entry;
  },
  listSiriTokens() { return getDemoState().siriTokens; },
  revokeSiriToken(id: string) {
    const state = getDemoState();
    state.siriTokens = state.siriTokens.filter((entry) => entry.id !== id);
  },
};
