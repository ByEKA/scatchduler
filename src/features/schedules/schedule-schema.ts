import { z } from 'zod';
import type { ID } from '@/data/types';
import { isCodeTaken } from '@/features/files/codes';

/** The schedule files the import accepts, compared case-insensitively (spec §5.7). */
export const SCHEDULE_EXTENSIONS = ['.xer', '.xml', '.csv'] as const;

/** 20 MB, the import size limit (spec §5.7, §6.10). */
export const MAX_SCHEDULE_BYTES = 20 * 1024 * 1024;

const scheduleName = z
  .string()
  .trim()
  .min(1, 'Enter a schedule name')
  .max(80, 'Use 80 characters or fewer');

const projectId = z.string({ error: 'Choose a project' }).min(1, 'Choose a project');

function hasScheduleExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SCHEDULE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

// The form holds null until a file is chosen; the parsed value is always a File. The second
// schema stops at the first failed check, so a large PDF reads as the wrong type only.
const scheduleFile = z
  .file()
  .nullish()
  .pipe(
    z
      .file({ error: 'Choose a file to import' })
      .refine((file) => hasScheduleExtension(file.name), {
        error: 'Use a .xer, .xml or .csv file',
        abort: true,
      })
      .max(MAX_SCHEDULE_BYTES, 'File must be 20 MB or smaller'),
  );

/** The hint under every schedule Code field (P3 core spec §6.4). */
export const SCHEDULE_CODE_HINT = 'Letters, numbers, ., - or _ · up to 24 characters';

/**
 * A schedule code (P3 core spec §6.5, R8): required, letters, digits, `.`, `-` and `_`, at most
 * 24 characters, and none of the project's `taken` codes, ignoring case. The pattern allows any
 * length, so a long code reports only its length.
 */
function scheduleCode(taken: readonly string[]) {
  return z
    .string()
    .trim()
    .min(1, 'Enter a schedule code')
    .regex(/^[A-Za-z0-9_.-]*$/, 'Use letters, numbers, ., - or _')
    .max(24, 'Use 24 characters or fewer')
    .refine((code) => !isCodeTaken(taken, code), 'This code is already used in this project');
}

/** New schedule's form; `taken` holds the codes of the chosen project's schedules. */
export function makeNewScheduleSchema(taken: readonly string[]) {
  return z.object({ name: scheduleName, code: scheduleCode(taken), projectId });
}

/** The P2 import dialog's form (the interim import path, P3 core spec §2.4). */
export function makeImportScheduleSchema(taken: readonly string[]) {
  return z.object({ file: scheduleFile, name: scheduleName, code: scheduleCode(taken), projectId });
}

// Until the files page knows a project's codes (Task 20), the dialogs check none and the server's
// R8 check answers.
export const newScheduleSchema = makeNewScheduleSchema([]);

export const importScheduleSchema = makeImportScheduleSchema([]);

export type NewScheduleValues = z.infer<typeof newScheduleSchema>;
export type ImportScheduleValues = z.infer<typeof importScheduleSchema>;

// Defined in a leaf module, so codes.ts can use it without an import cycle.
export { scheduleNameFromFile } from '@/features/schedules/file-name';

/**
 * The project a schedule dialog starts with (spec §6.7): the one the dialog was opened for, else
 * the current project, else the first project of the list. Ids not in `projects` are skipped;
 * `null` when the list is empty.
 */
export function defaultProjectId(
  projects: readonly { id: ID }[],
  requested: ID | undefined,
  current: ID | undefined,
): ID | null {
  const candidates = [requested, current, projects[0]?.id];
  return candidates.find((id) => id !== undefined && projects.some((p) => p.id === id)) ?? null;
}

/** The schedule page an imported schedule opens on (spec §4.4). */
export function schedulePath(workspaceId: ID, projectId: ID, scheduleId: ID): string {
  return `/w/${workspaceId}/p/${projectId}/schedule?scheduleId=${scheduleId}`;
}

/** A project's files page, where a new schedule lands (P3 core spec D16). */
export function filesPath(workspaceId: ID, projectId: ID): string {
  return `/w/${workspaceId}/p/${projectId}/files`;
}
