const BRACKETS: Record<string, string> = {
  "（": "(", "）": ")", "［": "[", "］": "]", "【": "[", "】": "]", "｛": "{", "｝": "}",
};

export function cleanDisplayName(input: string): string {
  return input.normalize("NFKC").replace(/[（）（）［］【】｛｝]/g, (char) => BRACKETS[char] ?? char).replace(/\s+/g, " ").trim()
    .replace(/揚げ玉/g, "天かす")
    .replace(/生姜チューブ|しょうがチューブ|チューブしょうが/g, "しょうがチューブ")
    .replace(/ニンニクチューブ|にんにくちゅーぶ|チューブにんにく/g, "にんにくチューブ");
}

export function normalizeProductName(input: string): string {
  return cleanDisplayName(input)
    .toLocaleLowerCase("ja-JP")
    .replace(/\s*([()\[\]{},、])\s*/g, "$1")
    .replace(/[‐‑‒–—―ー]/g, "-");
}

/** 表記ゆれ比較専用。表示名や通常の商品統合キーは変更しない。 */
export function normalizeMergeComparisonName(input: string): string {
  return normalizeProductName(input)
    .replace(/とける/g, "溶ける")
    .replace(/にんにく/g, "ニンニク")
    .replace(/しょうが/g, "生姜");
}

export function mergeSimilarity(a: string, b: string): number {
  const left = normalizeMergeComparisonName(a);
  const right = normalizeMergeComparisonName(b);
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - levenshtein(left, right) / longest;
}

export function extractProductTypeTokens(input: string): string[] {
  const name = normalizeMergeComparisonName(input);
  const tokens: string[] = [];
  if (name.includes("スライス")) tokens.push("スライス");
  if (name.includes("溶ける")) tokens.push("溶ける");
  if (name.includes("ピザ")) tokens.push("ピザ");
  if (name.includes("粉")) tokens.push("粉");
  if (name.includes("クリーム")) tokens.push("クリーム");
  if (name.includes("固形")) tokens.push("固形");
  if (name.includes("キッチン")) tokens.push("キッチン");
  if (name.includes("トイレット")) tokens.push("トイレット");
  if (name.includes("ハンド")) tokens.push("ハンド");
  return tokens;
}

function hasConflictingType(a: string, b: string): boolean {
  const left = extractProductTypeTokens(a);
  const right = extractProductTypeTokens(b);
  return left.length > 0 && right.length > 0 && !left.some((token) => right.includes(token));
}

export function extractSizeTokens(input: string): string[] {
  return normalizeProductName(input).match(/\d+(?:\.\d+)?\s*(?:ml|l|g|kg|個|枚|本|袋|缶|パック)/gi) ?? [];
}

export function levenshtein(a: string, b: string): number {
  const rows = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = rows[0];
    rows[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = rows[j];
      rows[j] = Math.min(rows[j] + 1, rows[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return rows[b.length];
}

export function similarity(a: string, b: string): number {
  const left = normalizeProductName(a);
  const right = normalizeProductName(b);
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - levenshtein(left, right) / longest;
}

export function normalizeSearchName(input: string): string {
  return normalizeProductName(input).replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

const SEARCH_READING_ALIASES: Record<string, string[]> = {
  "サトウ": ["砂糖", "上白糖", "グラニュー糖", "てんさい糖", "てんさいとう"],
  "ショウユ": ["醤油", "しょう油"],
  "ミソ": ["味噌", "みそ"],
  "シオ": ["塩", "岩塩"],
};

export function searchNameMatches(query: string, name: string): boolean {
  const normalizedQuery = normalizeSearchName(query);
  const normalizedName = normalizeSearchName(name);
  if (!normalizedQuery) return true;
  if (hasConflictingType(query, name)) return false;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return true;
  if (similarity(query, name) >= 0.42) return true;
  return (SEARCH_READING_ALIASES[normalizedQuery] ?? []).some((alias) => {
    const normalizedAlias = normalizeProductName(alias);
    return normalizedName.includes(normalizedAlias) || similarity(alias, name) >= 0.55;
  });
}

export function findSimilarProductNames(query: string, names: string[], limit = 2): string[] {
  const normalizedQuery = normalizeSearchName(query);
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.some((name) => normalizeSearchName(name) === normalizedQuery)) return [];
  return uniqueNames
    .filter((name) => searchNameMatches(query, name))
    .sort((left, right) => similarity(query, left) - similarity(query, right) || left.localeCompare(right, "ja"))
    .slice(-limit)
    .reverse();
}
