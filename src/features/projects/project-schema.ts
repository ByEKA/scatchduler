import { isBefore, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import type { NewProjectInput } from '@/data/repository';
import type { ID, ProjectType } from '@/data/types';

/** The wizard's steps in order (spec §6.7). */
export const WIZARD_STEPS = [
  { id: 'details', label: 'Details' },
  { id: 'attributes', label: 'Attributes' },
  { id: 'client', label: 'Client' },
  { id: 'location', label: 'Location' },
] as const;

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id'];

/** What the wizard's fields hold. Optional text is `''` until filled; the photo is `null`. */
export interface ProjectFormValues {
  name: string;
  code: string;
  coverImage: File | null;
  description: string;
  projectType: ProjectType | '';
  statusDate: string;
  startDate: string;
  plannedFinishDate: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  address: string;
  city: string;
  country: string;
}

export const EMPTY_PROJECT_FORM: ProjectFormValues = {
  name: '',
  code: '',
  coverImage: null,
  description: '',
  projectType: '',
  statusDate: '',
  startDate: '',
  plannedFinishDate: '',
  clientName: '',
  contactName: '',
  contactEmail: '',
  address: '',
  city: '',
  country: '',
};

/** The fields of each step in the order the step shows them; "Next" validates these only. */
export const STEP_FIELDS: Record<WizardStepId, Array<keyof ProjectFormValues>> = {
  details: ['name', 'code', 'coverImage', 'description'],
  attributes: ['projectType', 'statusDate', 'startDate', 'plannedFinishDate'],
  client: ['clientName', 'contactName', 'contactEmail'],
  location: ['address', 'city', 'country'],
};

/** The Project type options in the order the Select lists them (spec §6.7). */
export const PROJECT_TYPE_OPTIONS: ReadonlyArray<{ value: ProjectType; label: string }> = [
  { value: 'building', label: 'Building' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'residential', label: 'Residential' },
  { value: 'other', label: 'Other' },
];

const PROJECT_TYPES = ['building', 'infrastructure', 'industrial', 'residential', 'other'] as const;

/** The photo types the wizard accepts (spec §5.7). */
export const COVER_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png'];

/** 5 MB, the photo size limit (spec §5.7). */
export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;

/** The Description limit, also shown by its live counter. */
export const DESCRIPTION_MAX_LENGTH = 500;

/** The copy for a Project ID that another project of the workspace has (spec §5.7). */
export const CODE_TAKEN_MESSAGE = 'This ID is already used in this workspace';

/** The copy for a date that isn't a real 'YYYY-MM-DD' date (spec §5.7, D12). */
export const INVALID_DATE_MESSAGE = 'Enter a valid date';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a real calendar date written as 'YYYY-MM-DD'. A native date input can hold a five-digit
 * year, which parseISO and the rest of the app can't read.
 */
function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && isValid(parseISO(value));
}

function optionalText(max: number) {
  return z.string().trim().max(max, `Use ${max} characters or fewer`);
}

const optionalDate = z.string().refine((value) => value === '' || isIsoDate(value), {
  error: INVALID_DATE_MESSAGE,
});

// The photo is checked for its type first, so a large GIF reads as the wrong type only.
const coverImage = z
  .file()
  .refine((file) => COVER_IMAGE_TYPES.includes(file.type.toLowerCase()), {
    error: 'Use a JPG or PNG image',
    abort: true,
  })
  .max(MAX_COVER_IMAGE_BYTES, 'Image must be 5 MB or smaller')
  .nullable();

/** One schema for every step (spec §5.7); a step validates its own `STEP_FIELDS` through it. */
export const projectFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a project name').max(80, 'Use 80 characters or fewer'),
    // `*` rather than `+`, so an empty ID reports only "Enter a project ID".
    code: z
      .string()
      .trim()
      .min(1, 'Enter a project ID')
      .max(16, 'Use 16 characters or fewer')
      .regex(/^[A-Za-z0-9_-]*$/, 'Use letters, numbers, - or _'),
    coverImage,
    // The counter shows the length as typed, so the limit applies to it too.
    description: z
      .string()
      .max(DESCRIPTION_MAX_LENGTH, `Use ${DESCRIPTION_MAX_LENGTH} characters or fewer`),
    projectType: z.union([z.enum(PROJECT_TYPES), z.literal('')]),
    statusDate: optionalDate,
    startDate: optionalDate,
    plannedFinishDate: optionalDate,
    clientName: optionalText(80),
    contactName: optionalText(80),
    contactEmail: z
      .string()
      .trim()
      .refine((value) => value === '' || EMAIL.test(value), {
        error: 'Enter a valid email address',
      }),
    address: optionalText(160),
    city: optionalText(80),
    country: optionalText(80),
  })
  .superRefine(({ startDate, plannedFinishDate }, ctx) => {
    if (!isIsoDate(startDate) || !isIsoDate(plannedFinishDate)) return;
    if (isBefore(parseISO(plannedFinishDate), parseISO(startDate))) {
      ctx.addIssue({
        code: 'custom',
        path: ['plannedFinishDate'],
        message: 'Finish must be on or after the start date',
      });
    }
  }) satisfies z.ZodType<ProjectFormValues, ProjectFormValues>;

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** The create request for the form's values: strings trimmed, empty optional values `null`. */
export function toNewProjectInput(values: ProjectFormValues, workspaceId: ID): NewProjectInput {
  return {
    workspaceId,
    code: values.code.trim(),
    name: values.name.trim(),
    description: textOrNull(values.description),
    coverImage: values.coverImage,
    statusDate: textOrNull(values.statusDate),
    attributes: {
      projectType: values.projectType === '' ? null : values.projectType,
      startDate: textOrNull(values.startDate),
      plannedFinishDate: textOrNull(values.plannedFinishDate),
    },
    client: {
      name: textOrNull(values.clientName),
      contactName: textOrNull(values.contactName),
      contactEmail: textOrNull(values.contactEmail),
    },
    location: {
      address: textOrNull(values.address),
      city: textOrNull(values.city),
      country: textOrNull(values.country),
    },
  };
}
