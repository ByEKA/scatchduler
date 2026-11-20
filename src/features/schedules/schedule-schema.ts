import { z } from 'zod';
import type { ID } from '@/data/types';
import { isCodeTaken } from '@/features/files/codes';

/** The schedule files the stepped import accepts (P3 core spec §6.5). */
export const IMPORT_EXTENSIONS = ['.xer', '.xml', '.xlsx', '.csv'] as const;

/** The MIME type for .xlsx workbooks passed to FileDropzone's file picker (P3 core spec §9). */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Extensions refused with tool-specific guidance before inspecting (P3 core spec §5.2). */
export const REFUSED_EXTENSIONS: Readonly<Record<'.mpp' | '.xls', string>> = {
  '.mpp':
    "MPP files can't be imported. In Microsoft Project, save the file as XML and import that.",
  '.xls':
    "Older Excel workbooks (.xls) can't be imported. In Excel, save the file as .xlsx and import that.",
};

/** 50 MB, the import size limit (P3 core spec §5.10, §6.5, D67). */
export const MAX_SCHEDULE_BYTES = 50 * 1024 * 1024;

/** File check for the stepped import's File step (P3 core spec §6.5, §5.2, D67). */
export const importFileSchema = z
  .file()
  .nullish()
  .pipe(
    z.file({ error: 'Choose a file to import' }).superRefine((file, ctx) => {
      const lower = file.name.toLowerCase();
      for (const [extension, message] of Object.entries(REFUSED_EXTENSIONS)) {
        if (lower.endsWith(extension)) {
          ctx.addIssue({ code: 'custom', message });
          return;
        }
      }
      if (!IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
        ctx.addIssue({ code: 'custom', message: 'Use a .xer, .xml, .xlsx or .csv file' });
        return;
      }
      if (file.size > MAX_SCHEDULE_BYTES) {
        ctx.addIssue({ code: 'custom', message: 'File must be 50 MB or smaller' });
      }
    }),
  );

const scheduleName = z
  .string()
  .trim()
  .min(1, 'Enter a schedule name')
  .max(80, 'Use 80 characters or fewer');

const projectId = z.string({ error: 'Choose a project' }).min(1, 'Choose a project');

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

// The schema without known codes; New schedule checks the chosen project's codes with
// makeNewScheduleSchema.
export const newScheduleSchema = makeNewScheduleSchema([]);

export type NewScheduleValues = z.infer<typeof newScheduleSchema>;

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

/** A project's files page, where a new or imported schedule lands (P3 core spec D16). */
export function filesPath(workspaceId: ID, projectId: ID): string {
  return `/w/${workspaceId}/p/${projectId}/files`;
}
