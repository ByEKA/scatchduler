// The schedule rules the database enforces (P3 core spec §4.3), as pure functions the mock
// repository runs inside its writes with the same codes and copy.
import { RepositoryError } from '@/data/errors';
import type { ID, Schedule } from '@/data/types';

/** R8: the `schedules.code` check constraint. */
export const SCHEDULE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,24}$/;

/** Supabase's copy for a plain check violation (P2 spec §8.4). */
const INVALID_VALUES = "Some values aren't valid. Check the form and try again.";

/**
 * The form two schedule codes are compared in: trimmed and lower-cased. `toLowerCase`, as the
 * database's `lower()` on ASCII codes, not the locale-aware version.
 */
export function scheduleCodeKey(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * R8 for a new schedule of `projectId`: returns the trimmed code, or throws as the database
 * answers — 'validation' "Enter a schedule code." when nothing is left after trimming,
 * 'validation' with the plain check copy when it breaks the pattern, and 'conflict' when another
 * schedule of the project has the same code, ignoring case.
 */
export function checkNewScheduleCode(
  schedules: readonly Schedule[],
  projectId: ID,
  code: string,
): string {
  const trimmed = code.trim();
  if (trimmed === '') throw new RepositoryError('validation', 'Enter a schedule code.');
  if (!SCHEDULE_CODE_PATTERN.test(trimmed)) {
    throw new RepositoryError('validation', INVALID_VALUES);
  }
  const key = scheduleCodeKey(trimmed);
  if (
    schedules.some(
      (s) => s.projectId === projectId && s.code !== null && scheduleCodeKey(s.code) === key,
    )
  ) {
    throw new RepositoryError('conflict', 'This code is already used in this project.');
  }
  return trimmed;
}
