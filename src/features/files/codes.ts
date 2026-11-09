// Schedule code suggestions (P3 core spec §6.4 "Code suggestions", R8). Pure functions over the
// codes a project already uses; the server's R8 check stays authoritative.
import type { ScheduleSource } from '@/data/types';
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
