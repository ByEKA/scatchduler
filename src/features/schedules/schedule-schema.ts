import { z } from 'zod';
import type { ID } from '@/data/types';

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

export const newScheduleSchema = z.object({ name: scheduleName, projectId });

export const importScheduleSchema = z.object({ file: scheduleFile, name: scheduleName, projectId });

export type NewScheduleValues = z.infer<typeof newScheduleSchema>;
export type ImportScheduleValues = z.infer<typeof importScheduleSchema>;

/** The file name without its last extension and outer spaces: "Baseline.v2.XER" → "Baseline.v2". */
export function scheduleNameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  // In ".xer" the only dot starts the name, so there is no extension to drop.
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim();
}

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

/** The schedule page a new schedule opens on (spec §4.4). */
export function schedulePath(workspaceId: ID, projectId: ID, scheduleId: ID): string {
  return `/w/${workspaceId}/p/${projectId}/schedule?scheduleId=${scheduleId}`;
}
