// Text matching for header aliases, activity types, constraint names and every search box
// (P3 core spec §5.4). Sorting keeps P2 D21's collator; this is for matching only.

const COMBINING_MARKS = /\p{M}/gu;

/**
 * Folds text for matching: trimmed, lower-cased the Turkish way, dotless ı as i, and without the
 * combining marks left by canonical decomposition. "İŞ KODU" → "is kodu", "Activity ID" →
 * "activity id" (Turkish lower-casing turns I into ı, which the second step undoes).
 */
export function foldForMatch(text: string): string {
  return text
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '');
}

/** True when the folded query is part of the folded text; a blank query matches everything. */
export function matchesSearch(text: string | null, query: string): boolean {
  const folded = foldForMatch(query);
  if (folded === '') return true;
  if (text === null) return false;
  return foldForMatch(text).includes(folded);
}
