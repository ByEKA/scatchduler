// Ordering rules shared by both adapters (P2 spec §6.2), so a list comes back in the same order
// whichever adapter serves it. The Supabase adapter sorts the name-ordered lists with these
// comparators and runs the timestamp orders in SQL by the same rules.
import type { ID, Workspace } from '@/data/types';

/**
 * Turkish alphabetical order (Ç after C, Ğ after G, İ after I, Ö after O, Ş after S, Ü after U),
 * ignoring case but not accents (P2 spec D21). The locale is fixed, so the order doesn't follow
 * the machine's language. Built once: creating a collator costs far more than comparing with one.
 */
const textCollator = new Intl.Collator('tr', { sensitivity: 'accent' });

/** Names compare in Turkish alphabetical order, ignoring case. */
export function compareText(a: string, b: string): number {
  return textCollator.compare(a, b);
}

/**
 * The tie-break of every list ordered by a timestamp. IDs compare by UTF-16 code unit, not with
 * the collator: for the lower-case UUIDs both adapters use, this is the order of Postgres
 * `order by id`.
 */
export function compareIds(a: ID, b: ID): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Personal workspace first, then by name, then oldest first, then by id. */
export function compareWorkspaces(a: Workspace, b: Workspace): number {
  if (a.kind !== b.kind) return a.kind === 'personal' ? -1 : 1;
  return (
    compareText(a.name, b.name) ||
    Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
    compareIds(a.id, b.id)
  );
}

/**
 * A comparator for lists ordered by a timestamp: latest first, ties by id ascending.
 * (An unparsable timestamp gives `NaN`, which `||` also passes on to the id.)
 */
export function newestFirst<T extends { id: ID }>(
  timestamp: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => Date.parse(timestamp(b)) - Date.parse(timestamp(a)) || compareIds(a.id, b.id);
}
