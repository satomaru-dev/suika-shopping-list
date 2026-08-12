import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanDisplayName, normalizeProductName } from "../lib/normalization";

loadEnvConfig(process.cwd());

type Row = { rowNumber: number; name: string; purchasedAt: string };

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。");
  const sourcePath = path.join(process.cwd(), "data", "purchase-history.json");
  const source = await readFile(sourcePath);
  const rows = JSON.parse(source.toString("utf8")) as Row[];
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: household, error: householdError } = await supabase.from("households").select("id").limit(1).maybeSingle();
  if (householdError) throw householdError;
  if (!household) throw new Error("先にWeb画面で共通PINの初回設定を完了してください。");

  const initialBatch = await supabase.from("import_batches").select("id").eq("household_id", household.id).eq("source_hash", sourceHash).maybeSingle();
  let batch = initialBatch.data;
  if (initialBatch.error) throw initialBatch.error;
  if (!batch) {
    const created = await supabase.from("import_batches").insert({ household_id: household.id, source_name: "purchase-history.json", source_hash: sourceHash, row_count: 0 }).select("id").single();
    if (created.error) throw created.error;
    batch = created.data;
  }

  const { data: existing, error: existingError } = await supabase.from("shopping_items").select("import_row_number").eq("household_id", household.id).eq("import_batch_id", batch.id);
  if (existingError) throw existingError;
  const importedRows = new Set((existing ?? []).map((row) => row.import_row_number));
  const productCache = new Map<string, { id: string; display_name: string }>();
  let imported = 0;

  for (const row of rows) {
    if (importedRows.has(row.rowNumber)) continue;
    const displayName = cleanDisplayName(row.name);
    const normalizedName = normalizeProductName(displayName);
    if (!normalizedName || Number.isNaN(Date.parse(row.purchasedAt))) continue;
    let product = productCache.get(normalizedName);
    if (!product) {
      const upserted = await supabase.from("products").upsert({ household_id: household.id, display_name: displayName, normalized_name: normalizedName }, { onConflict: "household_id,normalized_name", ignoreDuplicates: true }).select("id,display_name").maybeSingle();
      if (upserted.error) throw upserted.error;
      if (upserted.data) product = upserted.data;
      else {
        const found = await supabase.from("products").select("id,display_name").eq("household_id", household.id).eq("normalized_name", normalizedName).single();
        if (found.error) throw found.error;
        product = found.data;
      }
      productCache.set(normalizedName, product);
    }
    const inserted = await supabase.from("shopping_items").insert({ household_id: household.id, product_id: product.id, original_name: row.name, source: "import", added_at: row.purchasedAt, purchased_at: row.purchasedAt, import_batch_id: batch.id, import_row_number: row.rowNumber });
    if (inserted.error) throw inserted.error;
    imported += 1;
    if (imported % 50 === 0) console.log(`${imported}件を追加しました`);
  }

  const { count, error: countError } = await supabase.from("shopping_items").select("id", { count: "exact", head: true }).eq("import_batch_id", batch.id);
  if (countError) throw countError;
  const { error: updateError } = await supabase.from("import_batches").update({ row_count: count ?? 0 }).eq("id", batch.id);
  if (updateError) throw updateError;
  console.log(`完了: 新規${imported}件 / 合計${count ?? 0}件（元データ${rows.length}件）`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
