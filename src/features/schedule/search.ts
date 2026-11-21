import type { ScheduleActivity } from '@/data/schedule-types';
import { foldForMatch } from '@/lib/search';

/**
 * Finds all activity IDs whose code or name matches `query` case- and diacritic-insensitively
 * using Turkish-aware folding (`src/lib/search.ts`). Blank query returns an empty array.
 */
export function findMatchingActivityIds(
  activities: readonly ScheduleActivity[],
  query: string,
): string[] {
  const folded = foldForMatch(query);
  if (folded === '') return [];

  const matches: string[] = [];
  for (const act of activities) {
    if (foldForMatch(act.code).includes(folded) || foldForMatch(act.name).includes(folded)) {
      matches.push(act.id);
    }
  }
  return matches;
}
