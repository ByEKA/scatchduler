import { foldForMatch } from '@/lib/search';
import type { ImportConstraintType } from '../model';

// Constraint names in table cells (P3 core spec §5.7), compared with foldForMatch: the app map's
// names, which P6 also uses, and Microsoft Project's names and abbreviations. The Turkish names
// join this list when V9 records them.

const CONSTRAINTS: ReadonlyMap<string, ImportConstraintType | 'none'> = new Map(
  (
    [
      // The app map's names (P6 uses them too).
      ['start on', 'start_on'],
      ['start on or after', 'start_on_or_after'],
      ['start on or before', 'start_on_or_before'],
      ['finish on', 'finish_on'],
      ['finish on or after', 'finish_on_or_after'],
      ['finish on or before', 'finish_on_or_before'],
      ['mandatory start', 'mandatory_start'],
      ['mandatory finish', 'mandatory_finish'],
      ['as late as possible', 'as_late_as_possible'],
      // Microsoft Project's names and abbreviations.
      ['as soon as possible', 'none'],
      ['asap', 'none'],
      ['alap', 'as_late_as_possible'],
      ['must start on', 'mandatory_start'],
      ['mso', 'mandatory_start'],
      ['must finish on', 'mandatory_finish'],
      ['mfo', 'mandatory_finish'],
      ['start no earlier than', 'start_on_or_after'],
      ['snet', 'start_on_or_after'],
      ['start no later than', 'start_on_or_before'],
      ['snlt', 'start_on_or_before'],
      ['finish no earlier than', 'finish_on_or_after'],
      ['fnet', 'finish_on_or_after'],
      ['finish no later than', 'finish_on_or_before'],
      ['fnlt', 'finish_on_or_before'],
    ] as const
  ).map(([name, type]) => [foldForMatch(name), type]),
);

/** The constraint a cell names: 'none' for an empty cell or "as soon as possible", null when unsupported. */
export function parseConstraint(text: string): ImportConstraintType | 'none' | null {
  const folded = foldForMatch(text).replace(/\s+/g, ' ');
  if (folded === '') return 'none';
  return CONSTRAINTS.get(folded) ?? null;
}
