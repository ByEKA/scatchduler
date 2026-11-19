import { isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import type { UpdateScheduleDetailsInput } from '@/data/repository';
import type { BaselineFlag, ID, Schedule } from '@/data/types';
import { isCodeTaken, suggestCodeFor } from '@/features/files/codes';

/** Maximum character length of schedule notes (spec §6.5). */
export const NOTES_MAX_LENGTH = 2000;

/** The baseline options in the Schedule details dialog (spec §6.4). */
export const BASELINE_OPTIONS: ReadonlyArray<{ value: BaselineFlag; label: string }> = [
  { value: 'none', label: 'Not a baseline' },
  { value: 'baseline', label: 'Baseline' },
  { value: 'primary', label: 'Primary baseline' },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHOLE_NUMBER = /^\d+$/;
const BASELINE_VALUES = ['none', 'baseline', 'primary'] as const satisfies readonly BaselineFlag[];

/** True for a real calendar date written as 'YYYY-MM-DD'. */
export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && isValid(parseISO(value));
}

export interface ScheduleDetailsValues {
  name: string;
  code: string;
  statusDate: string;
  baseline: BaselineFlag;
  updateNumber: string;
  notes: string;
}

/**
 * Validation schema for the Schedule details dialog (spec §6.5, R5–R8). `taken` holds the codes
 * of the project's other schedules.
 */
export function makeScheduleDetailsSchema(taken: readonly string[]) {
  return z.object({
    name: z.string().trim().min(1, 'Enter a schedule name').max(80, 'Use 80 characters or fewer'),
    code: z
      .string()
      .trim()
      .min(1, 'Enter a schedule code')
      .regex(/^[A-Za-z0-9_.-]*$/, 'Use letters, numbers, ., - or _')
      .max(24, 'Use 24 characters or fewer')
      .refine((code) => !isCodeTaken(taken, code), 'This code is already used in this project'),
    statusDate: z.string().refine((value) => value === '' || isIsoDate(value), {
      error: 'Enter a valid date',
    }),
    baseline: z.enum(BASELINE_VALUES),
    updateNumber: z.string().refine(
      (value) => {
        const trimmed = value.trim();
        if (trimmed === '') return true;
        if (!WHOLE_NUMBER.test(trimmed)) return false;
        const parsed = Number(trimmed);
        return parsed >= 1 && parsed <= 999;
      },
      { error: 'Enter a whole number from 1 to 999' },
    ),
    // The counter shows the length as typed, so the limit applies to the raw text.
    notes: z.string().max(NOTES_MAX_LENGTH, `Use ${NOTES_MAX_LENGTH} characters or fewer`),
  }) satisfies z.ZodType<ScheduleDetailsValues, ScheduleDetailsValues>;
}

/** Initial form values for a schedule; a P2-era schedule without a code starts on its suggestion. */
export function scheduleDetailsValues(
  schedule: Schedule,
  otherCodes: readonly string[],
): ScheduleDetailsValues {
  return {
    name: schedule.name,
    code: schedule.code ?? suggestCodeFor(otherCodes, schedule),
    statusDate: schedule.statusDate ?? '',
    baseline: schedule.baseline,
    updateNumber: schedule.updateNumber === null ? '' : String(schedule.updateNumber),
    notes: schedule.notes ?? '',
  };
}

/** Converts validated form values to the repository's `updateScheduleDetails` input. */
export function toUpdateScheduleDetailsInput(
  values: ScheduleDetailsValues,
  scheduleId: ID,
): UpdateScheduleDetailsInput {
  const trimmedUpdate = values.updateNumber.trim();
  const trimmedNotes = values.notes.trim();
  return {
    scheduleId,
    name: values.name.trim(),
    code: values.code.trim(),
    statusDate: values.statusDate === '' ? null : values.statusDate,
    baseline: values.baseline,
    updateNumber: trimmedUpdate === '' ? null : Number(trimmedUpdate),
    notes: trimmedNotes === '' ? null : trimmedNotes,
  };
}
