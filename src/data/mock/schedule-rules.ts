// The schedule rules the database enforces (P3 core spec §4.3), as pure functions the mock
// repository runs inside its writes with the same codes and copy. Each one works on the state the
// whole write leaves, before the repository's single commit.
import { RepositoryError } from '@/data/errors';
import type { UpdateScheduleDetailsInput } from '@/data/repository';
import { compareIds } from '@/data/sort';
import type { BaselineFlag, ID, ISODate, ISODateTime, Project, Schedule } from '@/data/types';

/** R8: the `schedules.code` check constraint. */
export const SCHEDULE_CODE_PATTERN = /^[A-Za-z0-9_.-]{1,24}$/;

/** Supabase's copy for a plain check violation (P2 spec §8.4). */
const INVALID_VALUES = "Some values aren't valid. Check the form and try again.";

/** R9's copy for a schedule id that names no schedule. */
export const SCHEDULES_GONE = 'Some schedules are no longer available. Refresh and try again.';

const CODE_TAKEN = 'This code is already used in this project.';
const UPDATE_NUMBER_TAKEN = 'This update number is already used in this project.';
const BASELINE_FLAGS: readonly BaselineFlag[] = ['none', 'baseline', 'primary'];

/**
 * The form two schedule codes are compared in: trimmed and lower-cased. `toLowerCase`, as the
 * database's `lower()` on ASCII codes, not the locale-aware version.
 */
export function scheduleCodeKey(code: string): string {
  return code.trim().toLowerCase();
}

/** The trimmed text, or `null` when nothing is left. */
function optionalText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Characters as Postgres `char_length` counts them (code points, not UTF-16 units). */
const charLength = (text: string): number => [...text].length;

/** True when a schedule of `projectId` other than `exceptId` has `code`, ignoring case. */
function isCodeTaken(
  schedules: readonly Schedule[],
  projectId: ID,
  code: string,
  exceptId: ID | null,
): boolean {
  const key = scheduleCodeKey(code);
  return schedules.some(
    (s) =>
      s.projectId === projectId &&
      s.id !== exceptId &&
      s.code !== null &&
      scheduleCodeKey(s.code) === key,
  );
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
  if (isCodeTaken(schedules, projectId, trimmed, null)) {
    throw new RepositoryError('conflict', CODE_TAKEN);
  }
  return trimmed;
}

/**
 * The `listSchedules` order: status date descending with undated schedules last, then newest
 * created, then by id ascending (`compareIds`, Postgres `order by id`).
 */
export function compareSchedules(a: Schedule, b: Schedule): number {
  if (a.statusDate !== b.statusDate) {
    if (a.statusDate === null) return 1;
    if (b.statusDate === null) return -1;
    // 'YYYY-MM-DD' strings sort in calendar order, so date-only values are never parsed here.
    return a.statusDate > b.statusDate ? -1 : 1;
  }
  return Date.parse(b.createdAt) - Date.parse(a.createdAt) || compareIds(a.id, b.id);
}

/** The project's current schedule (R1), or `null` when it has none. */
export function currentScheduleOf(schedules: readonly Schedule[], projectId: ID): Schedule | null {
  return schedules.find((s) => s.projectId === projectId && s.isCurrent) ?? null;
}

/**
 * Makes the schedule its project's current one: R4 refuses an archived schedule, and the flag
 * moves from the old current schedule in the same write (R1). `updatedAt` stays (R11).
 */
export function makeCurrent(schedules: Schedule[], scheduleId: ID): void {
  const target = schedules.find((s) => s.id === scheduleId);
  if (!target) throw new RepositoryError('validation', SCHEDULES_GONE);
  if (target.archivedAt !== null) {
    throw new RepositoryError('validation', 'Restore this schedule before making it current.');
  }
  for (const schedule of schedules) {
    if (schedule.projectId === target.projectId) schedule.isCurrent = schedule.id === target.id;
  }
}

/**
 * One save of the details dialog, in the order the database answers (`update_schedule_details`,
 * then the column checks, then the unique indexes): an empty code is R8's "Enter a schedule
 * code."; a name outside 1–80 characters, a code off the pattern, notes over 2000 characters, an
 * unknown baseline or an update number outside 1–999 'validation' with the plain check copy; a
 * code or update number another schedule of the project holds 'conflict' (R8, R7). Then R5: a new
 * primary baseline demotes the old one, whose `updatedAt` moves too, and a schedule that turns
 * from "not a baseline" into a baseline while the project has no primary becomes the primary one.
 * Text is trimmed (empty notes `null`) and `updatedAt` set to `now` (R11). Returns the schedule.
 */
export function applyDetails(
  schedules: Schedule[],
  input: UpdateScheduleDetailsInput,
  now: ISODateTime,
): Schedule {
  const schedule = schedules.find((s) => s.id === input.scheduleId);
  if (!schedule) throw new RepositoryError('validation', SCHEDULES_GONE);
  const code = input.code.trim();
  if (code === '') throw new RepositoryError('validation', 'Enter a schedule code.');
  const name = input.name.trim();
  const notes = optionalText(input.notes);
  const { updateNumber } = input;
  const valid =
    charLength(name) >= 1 &&
    charLength(name) <= 80 &&
    SCHEDULE_CODE_PATTERN.test(code) &&
    (notes === null || charLength(notes) <= 2000) &&
    BASELINE_FLAGS.includes(input.baseline) &&
    (updateNumber === null ||
      (Number.isInteger(updateNumber) && updateNumber >= 1 && updateNumber <= 999));
  if (!valid) throw new RepositoryError('validation', INVALID_VALUES);

  const others = schedules.filter((s) => s.projectId === schedule.projectId && s !== schedule);
  if (isCodeTaken(schedules, schedule.projectId, code, schedule.id)) {
    throw new RepositoryError('conflict', CODE_TAKEN);
  }
  if (updateNumber !== null && others.some((s) => s.updateNumber === updateNumber)) {
    throw new RepositoryError('conflict', UPDATE_NUMBER_TAKEN);
  }

  let baseline = input.baseline;
  if (baseline === 'primary' && schedule.baseline !== 'primary') {
    for (const other of others) {
      if (other.baseline === 'primary') {
        other.baseline = 'baseline';
        other.updatedAt = now;
      }
    }
  } else if (
    baseline === 'baseline' &&
    schedule.baseline === 'none' &&
    !others.some((s) => s.baseline === 'primary')
  ) {
    baseline = 'primary';
  }

  schedule.name = name;
  schedule.code = code;
  schedule.statusDate = optionalText(input.statusDate);
  schedule.notes = notes;
  schedule.baseline = baseline;
  schedule.updateNumber = updateNumber;
  schedule.updatedAt = now;
  return schedule;
}

/**
 * R6: while the project has a current schedule, its status date is that schedule's. Run after any
 * write that makes a schedule current or changes the current one's status date; the project's
 * `updatedAt` stays (R11).
 */
export function syncProjectStatusDate(project: Project, schedules: readonly Schedule[]): void {
  const current = currentScheduleOf(schedules, project.id);
  if (current && project.statusDate !== current.statusDate) {
    project.statusDate = current.statusDate;
  }
}

/**
 * R6's refusal for `updateProject`: while the project has a current schedule, a status date that
 * differs from that schedule's is 'validation' "The status date follows the current schedule.".
 */
export function checkProjectStatusDate(
  project: Project,
  schedules: readonly Schedule[],
  statusDate: ISODate | null,
): void {
  const current = currentScheduleOf(schedules, project.id);
  if (current && current.statusDate !== statusDate) {
    throw new RepositoryError('validation', 'The status date follows the current schedule.');
  }
}
