// Schedule code suggestions (P3 core spec §6.4 "Code suggestions", R8). Pure functions over the
// codes a project already uses; the server's R8 check stays authoritative.
import type { ID, ISODate, Schedule, ScheduleSource } from '@/data/types';
import { scheduleNameFromFile } from '@/features/schedules/file-name';

/** The longest schedule code (R8). */
const MAX_CODE_LENGTH = 24;

/** Every character a schedule code may not hold (R8: `[A-Za-z0-9_.-]`), one code point each. */
const NOT_CODE_CHARACTER = /[^A-Za-z0-9_.-]/gu;

/** Trimmed and lower-cased; `toLowerCase`, so a Turkish locale never turns `I` into `ı`. */
const codeKey = (code: string): string => code.trim().toLowerCase();

/** True when `code` is one of `taken`, comparing both trimmed and ignoring case. */
export function isCodeTaken(taken: readonly string[], code: string): boolean {
  const key = codeKey(code);
  return taken.some((t) => codeKey(t) === key);
}

/** The first free code of `S01`…`S99`, then `S100`, `S101`…, ignoring case. */
export function suggestNewScheduleCode(taken: readonly string[]): string {
  const keys = new Set(taken.map(codeKey));
  for (let n = 1; ; n += 1) {
    const code = `S${String(n).padStart(2, '0')}`;
    if (!keys.has(codeKey(code))) return code;
  }
}

/**
 * An import's code: the source project's short name (an XER project's), else the file name
 * without its extension, with every character a code can't hold turned into `-` and cut to 24
 * characters. When that is empty or taken, the `S` rule.
 */
export function suggestImportCode(
  taken: readonly string[],
  source: { sourceProjectCode?: string | null; fileName: string },
): string {
  const base = source.sourceProjectCode?.trim() || scheduleNameFromFile(source.fileName);
  const code = base.replace(NOT_CODE_CHARACTER, '-').slice(0, MAX_CODE_LENGTH);
  return code === '' || isCodeTaken(taken, code) ? suggestNewScheduleCode(taken) : code;
}

/**
 * The suggestion for a schedule without a code (a P2-era one): the import rule from its file
 * name when it was imported, else the `S` rule.
 */
export function suggestCodeFor(
  taken: readonly string[],
  schedule: { source: ScheduleSource; sourceFileName: string | null },
): string {
  return schedule.source === 'import' && schedule.sourceFileName !== null
    ? suggestImportCode(taken, { fileName: schedule.sourceFileName })
    : suggestNewScheduleCode(taken);
}

/**
 * Suggested update number for a schedule (spec §6.4): 1 + the number of the project's other
 * numbered schedules whose status date is on or before `statusDate`, or the highest number + 1
 * when `statusDate` is null; if taken, the next free number above it.
 */
export function suggestUpdateNumber(
  schedules: ReadonlyArray<Pick<Schedule, 'id' | 'statusDate' | 'updateNumber'>>,
  scheduleId: ID,
  statusDate: ISODate | null,
): number {
  const others = schedules.filter(
    (schedule): schedule is Pick<Schedule, 'id' | 'statusDate'> & { updateNumber: number } =>
      schedule.id !== scheduleId && schedule.updateNumber !== null,
  );
  const taken = new Set(others.map((schedule) => schedule.updateNumber));
  let candidate =
    statusDate === null
      ? others.reduce((highest, schedule) => Math.max(highest, schedule.updateNumber), 0) + 1
      : 1 +
        others.filter(
          (schedule) => schedule.statusDate !== null && schedule.statusDate <= statusDate,
        ).length;
  while (taken.has(candidate)) candidate += 1;
  return candidate;
}

/**
 * Suggested code for a duplicated schedule (P4 later spec §7.2.4, R6): appends `-COPY` (or
 * `-COPY-2`, `-COPY-3`, …) to the source code's stem, truncated to 24 characters; falls back to
 * `suggestNewScheduleCode` when the source has no code.
 */
export function suggestCopyCode(taken: readonly string[], sourceCode: string | null): string {
  const raw = sourceCode?.trim() ?? '';
  if (raw === '') return suggestNewScheduleCode(taken);
  const stem = raw.replace(/-copy(?:-\d+)?$/i, '') || raw;
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '-COPY' : `-COPY-${n}`;
    const prefix = stem.slice(0, Math.max(1, MAX_CODE_LENGTH - suffix.length));
    const candidate = `${prefix}${suffix}`;
    if (!isCodeTaken(taken, candidate)) return candidate;
  }
}

