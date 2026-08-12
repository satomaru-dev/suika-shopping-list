import { cleanDisplayName, normalizeProductName } from "./normalization";

export function splitSpokenItems(input: string, knownNames: string[] = []): string[] {
  const clean = cleanDisplayName(input);
  if (!clean) return [];

  const obvious = clean.split(/[、,，\n]+/).map(cleanDisplayName).filter(Boolean);
  const known = new Set(knownNames.map(normalizeProductName));
  const result: string[] = [];

  for (const part of obvious) {
    if (!part.includes("と")) {
      result.push(part);
      continue;
    }

    const pieces = part.split("と").map(cleanDisplayName).filter(Boolean);
    const safeKnownSplit = pieces.length > 1 && pieces.every((piece) => known.has(normalizeProductName(piece)));
    const commonListSplit = pieces.length > 1 && pieces.every((piece) => piece.length >= 1 && piece.length <= 16) && !/さとう|砂糖/i.test(part);
    result.push(...(safeKnownSplit || commonListSplit ? pieces : [part]));
  }

  return Array.from(new Map(result.map((name) => [normalizeProductName(name), name])).values()).slice(0, 20);
}
