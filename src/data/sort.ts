// Ordering rules shared by both adapters (P2 spec §6.2), so a list comes back in the same order
// whichever adapter serves it. The Supabase adapter sorts the name-ordered lists with these
// comparators and runs the timestamp orders in SQL by the same rules.
import type { ID, Role, Workspace, WorkspaceMember } from '@/data/types';
import { fullName } from '@/lib/format';

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

/** The order roles come in member lists. */
const ROLE_ORDER: Record<Role, number> = { owner: 0, editor: 1, viewer: 2 };

/** The name a member list shows: the full name, or the email when the name is empty. */
function memberName(member: WorkspaceMember): string {
  return fullName(member) || member.email;
}

/** Owners first, then editors, then viewers; within a role by name, then by email. */
export function compareMembers(a: WorkspaceMember, b: WorkspaceMember): number {
  return (
    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
    compareText(memberName(a), memberName(b)) ||
    compareText(a.email, b.email)
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
