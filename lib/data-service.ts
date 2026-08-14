import "server-only";
import { demoStore } from "./demo-store";
import { isDemoMode } from "./env";
import { HttpError } from "./http";
import { cleanDisplayName, extractProductTypeTokens, extractSizeTokens, mergeSimilarity, normalizeProductName } from "./normalization";
import { calculateRecommendations } from "./recommendations";
import { getSupabaseAdmin } from "./supabase";
import type { ItemSource, MergeCandidate, MergeHistory, ShoppingItem } from "./types";
import { randomToken, sha256 } from "./crypto";

type DbShoppingItem = {
  id: string; product_id: string; original_name: string; added_at: string; purchased_at: string | null; source: ItemSource;
  products?: { display_name: string } | { display_name: string }[] | null;
};

function mapItem(row: DbShoppingItem): ShoppingItem {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return { id: row.id, productId: row.product_id, name: product?.display_name ?? row.original_name, originalName: row.original_name, addedAt: row.added_at, purchasedAt: row.purchased_at, source: row.source };
}

export async function listItems(householdId: string, status: "pending" | "purchased", limit = 100): Promise<ShoppingItem[]> {
  if (isDemoMode()) return demoStore.listItems(status).slice(0, limit);
  let query = getSupabaseAdmin().from("shopping_items").select("id,product_id,original_name,added_at,purchased_at,source,products!inner(display_name)").eq("household_id", householdId).order(status === "pending" ? "added_at" : "purchased_at", { ascending: false }).limit(limit);
  query = status === "pending" ? query.is("purchased_at", null) : query.not("purchased_at", "is", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapItem(row as DbShoppingItem));
}

async function findOrCreateProduct(householdId: string, rawName: string) {
  const supabase = getSupabaseAdmin();
  const name = cleanDisplayName(rawName);
  const normalizedName = normalizeProductName(name);
  if (!normalizedName || name.length > 100) throw new HttpError(400, "商品名は1〜100文字で入力してください。", "INVALID_NAME");
  const [aliasResult, productResult] = await Promise.all([
    supabase.from("product_aliases").select("product_id,products!inner(id,display_name)").eq("household_id", householdId).eq("normalized_alias", normalizedName).maybeSingle(),
    supabase.from("products").select("id,display_name").eq("household_id", householdId).eq("normalized_name", normalizedName).maybeSingle(),
  ]);
  const { data: alias, error: aliasError } = aliasResult;
  if (aliasError) throw aliasError;
  if (alias) {
    const product = Array.isArray(alias.products) ? alias.products[0] : alias.products;
    if (product) return product as { id: string; display_name: string };
  }
  const { data: existingProduct, error: productError } = productResult;
  if (productError) throw productError;
  if (existingProduct) return existingProduct;
  const { data, error } = await supabase.from("products").upsert({ household_id: householdId, display_name: name, normalized_name: normalizedName }, { onConflict: "household_id,normalized_name", ignoreDuplicates: true }).select("id,display_name").maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: existing, error: findError } = await supabase.from("products").select("id,display_name").eq("household_id", householdId).eq("normalized_name", normalizedName).single();
  if (findError) throw findError;
  return existing;
}

export async function addItems(householdId: string, names: string[], source: ItemSource): Promise<ShoppingItem[]> {
  const unique = Array.from(new Map(names.map((name) => [normalizeProductName(name), cleanDisplayName(name)])).values()).filter(Boolean).slice(0, 20);
  if (!unique.length) throw new HttpError(400, "商品名を入力してください。", "EMPTY_ITEMS");
  if (isDemoMode()) return demoStore.addItems(unique, source);
  const supabase = getSupabaseAdmin();
  const added: ShoppingItem[] = [];
  for (const name of unique) {
    const product = await findOrCreateProduct(householdId, name);
    const { data, error } = await supabase.from("shopping_items").insert({ household_id: householdId, product_id: product.id, original_name: name, source }).select("id,product_id,original_name,added_at,purchased_at,source").maybeSingle();
    if (error?.code === "23505") continue;
    if (error) throw error;
    if (data) added.push(mapItem({ ...data, products: product } as DbShoppingItem));
  }
  return added;
}

export async function updateItem(householdId: string, id: string, purchased: boolean): Promise<ShoppingItem> {
  if (isDemoMode()) {
    try { const item = demoStore.updateItem(id, purchased); if (!item) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND"); return item; }
    catch (error) { if (error instanceof Error && error.message === "ALREADY_PENDING") throw new HttpError(409, "すでに買うものへ入っています。", "ALREADY_PENDING"); throw error; }
  }
  const supabase = getSupabaseAdmin();
  const purchasedAt = purchased ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("shopping_items").update({ purchased_at: purchasedAt }).eq("household_id", householdId).eq("id", id).select("id,product_id,original_name,added_at,purchased_at,source,products!inner(display_name)").maybeSingle();
  if (error?.code === "23505") throw new HttpError(409, "すでに買うものへ入っています。", "ALREADY_PENDING");
  if (error) throw error;
  if (!data) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND");
  return mapItem(data as DbShoppingItem);
}

export async function changeItemProduct(householdId: string, id: string, productName: string): Promise<ShoppingItem> {
  const normalized = normalizeProductName(cleanDisplayName(productName));
  if (isDemoMode()) {
    const item = demoStore.changeItemProduct(id, productName);
    if (!item) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND");
    return item;
  }
  const supabase = getSupabaseAdmin();
  const displayName = cleanDisplayName(productName);
  const { data: product } = await supabase.from("products").upsert({ household_id: householdId, display_name: displayName, normalized_name: normalized }, { onConflict: "household_id,normalized_name", ignoreDuplicates: true }).select("id").maybeSingle();
  const resolvedProduct = product ?? (await supabase.from("products").select("id").eq("household_id", householdId).eq("normalized_name", normalized).single()).data;
  if (!resolvedProduct) throw new HttpError(400, "商品名を登録できませんでした。", "PRODUCT_CREATE_FAILED");
  const { data, error } = await supabase.from("shopping_items").update({ product_id: resolvedProduct.id, original_name: displayName }).eq("household_id", householdId).eq("id", id).select("id,product_id,original_name,added_at,purchased_at,source,products!inner(display_name)").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND");
  return mapItem(data as DbShoppingItem);
}

export async function changePurchaseDate(householdId: string, id: string, purchasedAt: string): Promise<ShoppingItem> {
  if (isDemoMode()) {
    const item = demoStore.changePurchaseDate(id, purchasedAt);
    if (!item) throw new HttpError(404, "履歴が見つかりません。", "NOT_FOUND");
    return item;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("shopping_items").update({ purchased_at: purchasedAt }).eq("household_id", householdId).eq("id", id).not("purchased_at", "is", null).select("id,product_id,original_name,added_at,purchased_at,source,products!inner(display_name)").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "履歴が見つかりません。", "NOT_FOUND");
  return mapItem(data as DbShoppingItem);
}

export async function deleteItem(householdId: string, id: string) {
  if (isDemoMode()) { if (!demoStore.deleteItem(id)) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND"); return; }
  const { data, error } = await getSupabaseAdmin().from("shopping_items").delete().eq("household_id", householdId).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND");
}

export async function getRecommendations(householdId: string) {
  if (isDemoMode()) return demoStore.recommendations();
  const { data, error } = await getSupabaseAdmin().from("shopping_items").select("id,product_id,original_name,added_at,purchased_at,source,products!inner(display_name)").eq("household_id", householdId).order("purchased_at", { ascending: true }).limit(10_000);
  if (error) throw error;
  return calculateRecommendations((data ?? []).map((row) => mapItem(row as DbShoppingItem)));
}

export async function getProductNames(householdId: string): Promise<string[]> {
  if (isDemoMode()) return demoStore.productNames();
  const supabase = getSupabaseAdmin();
  const { data: activeItems, error: activeItemsError } = await supabase.from("shopping_items").select("product_id").eq("household_id", householdId);
  if (activeItemsError) throw activeItemsError;
  const activeProductIds = [...new Set((activeItems ?? []).map((item) => item.product_id))];
  if (!activeProductIds.length) return [];
  const { data, error } = await supabase.from("products").select("display_name").eq("household_id", householdId).in("id", activeProductIds).order("display_name");
  if (error) throw error;
  return (data ?? []).map((row) => row.display_name);
}

export async function getMergeCandidates(householdId: string): Promise<MergeCandidate[]> {
  if (isDemoMode()) return demoStore.mergeCandidates();
  const supabase = getSupabaseAdmin();
  const { data: activeItems, error: activeItemsError } = await supabase.from("shopping_items").select("product_id").eq("household_id", householdId);
  if (activeItemsError) throw activeItemsError;
  const activeProductIds = [...new Set((activeItems ?? []).map((item) => item.product_id))];
  if (!activeProductIds.length) return [];
  const { data, error } = await supabase.from("products").select("id,display_name").eq("household_id", householdId).in("id", activeProductIds).limit(1000);
  if (error) throw error;
  const products = data ?? [];
  const result: MergeCandidate[] = [];
  for (let i = 0; i < products.length; i += 1) for (let j = i + 1; j < products.length; j += 1) {
    const leftTypes = extractProductTypeTokens(products[i].display_name);
    const rightTypes = extractProductTypeTokens(products[j].display_name);
    const sharedType = leftTypes.length === 0 || rightTypes.length === 0 || leftTypes.some((type) => rightTypes.includes(type));
    const overlappingType = leftTypes.length > 0 && rightTypes.length > 0 && leftTypes.some((type) => rightTypes.includes(type));
    const differentCoreCategory = products[i].display_name.includes("チーズ") !== products[j].display_name.includes("チーズ");
    const score = mergeSimilarity(products[i].display_name, products[j].display_name);
    if (!differentCoreCategory && sharedType && (score >= 0.72 || (overlappingType && score >= 0.5)) && normalizeProductName(products[i].display_name) !== normalizeProductName(products[j].display_name)) {
      const sizeDiffers = extractSizeTokens(products[i].display_name).join() !== extractSizeTokens(products[j].display_name).join();
      const typesDiffer = leftTypes.join() !== rightTypes.join();
      const warnings = [typesDiffer ? "商品種類が異なる可能性があります" : undefined, sizeDiffers ? "容量・個数が異なる可能性があります" : undefined].filter(Boolean);
      result.push({ left: { id: products[i].id, name: products[i].display_name }, right: { id: products[j].id, name: products[j].display_name }, score, warning: warnings.join("。") || undefined });
    }
  }
  return result.sort((a, b) => b.score - a.score).slice(0, 30);
}

export async function mergeProducts(householdId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new HttpError(400, "異なる商品を選んでください。", "INVALID_MERGE");
  if (isDemoMode()) { if (!demoStore.mergeProducts(sourceId, targetId)) throw new HttpError(404, "商品が見つかりません。", "NOT_FOUND"); return; }
  const supabase = getSupabaseAdmin();
  const { data: targetPending } = await supabase.from("shopping_items").select("id").eq("household_id", householdId).eq("product_id", targetId).is("purchased_at", null).maybeSingle();
  if (targetPending) await supabase.from("shopping_items").delete().eq("household_id", householdId).eq("product_id", sourceId).is("purchased_at", null);
  const { error } = await supabase.from("shopping_items").update({ product_id: targetId }).eq("household_id", householdId).eq("product_id", sourceId);
  if (error) throw error;
  const { data: source } = await supabase.from("products").select("display_name,normalized_name").eq("household_id", householdId).eq("id", sourceId).maybeSingle();
  const { data: target } = await supabase.from("products").select("display_name").eq("household_id", householdId).eq("id", targetId).maybeSingle();
  if (source && target) await supabase.from("product_merge_history").insert({ household_id: householdId, source_name: source.display_name, target_name: target.display_name });
  if (source) await supabase.from("product_aliases").upsert({ household_id: householdId, product_id: targetId, display_alias: source.display_name, normalized_alias: source.normalized_name }, { onConflict: "household_id,normalized_alias" });
  await supabase.from("products").delete().eq("household_id", householdId).eq("id", sourceId);
}

export async function getMergeHistory(householdId: string): Promise<MergeHistory[]> {
  if (isDemoMode()) return demoStore.mergeHistory();
  const { data, error } = await getSupabaseAdmin().from("product_merge_history").select("id,source_name,target_name,merged_at").eq("household_id", householdId).order("merged_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, sourceName: row.source_name, targetName: row.target_name, mergedAt: row.merged_at }));
}

export async function resetMerges(_householdId: string) {
  void _householdId;
  if (isDemoMode()) { demoStore.resetMerges(); return; }
  throw new HttpError(400, "本番データの統合取り消しは、履歴を確認してから実行してください。", "RESET_REQUIRES_REVIEW");
}

export async function createSiriToken(householdId: string, label: string) {
  if (isDemoMode()) {
    const token = randomToken();
    return { ...demoStore.createSiriToken(label), token };
  }
  const token = randomToken();
  const { data, error } = await getSupabaseAdmin().from("siri_tokens").insert({ household_id: householdId, label: label.trim() || "iPhone", token_hash: sha256(token) }).select("id,label,created_at").single();
  if (error) throw error;
  return { id: data.id, label: data.label, createdAt: data.created_at, token };
}

export async function listSiriTokens(householdId: string) {
  if (isDemoMode()) return demoStore.listSiriTokens().map((entry) => ({ id: entry.id, label: entry.label, created_at: entry.createdAt, last_used_at: null }));
  const { data, error } = await getSupabaseAdmin().from("siri_tokens").select("id,label,created_at,last_used_at").eq("household_id", householdId).is("revoked_at", null).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function revokeSiriToken(householdId: string, id: string) {
  if (isDemoMode()) { demoStore.revokeSiriToken(id); return; }
  const { error } = await getSupabaseAdmin().from("siri_tokens").update({ revoked_at: new Date().toISOString() }).eq("household_id", householdId).eq("id", id);
  if (error) throw error;
}

export async function authenticateSiriToken(token: string): Promise<string> {
  if (isDemoMode()) return "demo-household";
  if (!token) throw new HttpError(401, "Siriトークンが必要です。", "INVALID_TOKEN");
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("siri_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", sha256(token))
    .is("revoked_at", null)
    .select("id,household_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(401, "Siriトークンが無効です。", "INVALID_TOKEN");
  return data.household_id;
}
