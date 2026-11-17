import { isBefore, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import type { NewProjectInput } from '@/data/repository';
import type { ID, ProjectSector, ProjectStage, ProjectStatus, ProjectType } from '@/data/types';
import { coordinateDecimals, parseCoordinate } from '@/features/projects/coordinates';
import {
  PROJECT_TYPE_OPTIONS,
  SECTOR_OPTIONS,
  STAGE_OPTIONS,
  STATUS_OPTIONS,
} from '@/lib/project-options';

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
  status: ProjectStatus;
  stage: ProjectStage | '';
  projectType: ProjectType | '';
  sector: ProjectSector | '';
  statusDate: string;
  startDate: string;
  plannedFinishDate: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  address: string;
  city: string;
  country: string;
  latitude: string;
  longitude: string;
}

export const EMPTY_PROJECT_FORM: ProjectFormValues = {
  name: '',
  code: '',
  coverImage: null,
  description: '',
  status: 'active',
  stage: '',
  projectType: '',
  sector: '',
  statusDate: '',
  startDate: '',
  plannedFinishDate: '',
  clientName: '',
  contactName: '',
  contactEmail: '',
  address: '',
  city: '',
  country: '',
  latitude: '',
  longitude: '',
};

/** The fields of each step in the order the step shows them; "Next" validates these only. */
export const STEP_FIELDS: Record<WizardStepId, Array<keyof ProjectFormValues>> = {
  details: ['name', 'code', 'coverImage', 'description'],
  attributes: [
    'status',
    'stage',
    'projectType',
    'sector',
    'statusDate',
    'startDate',
    'plannedFinishDate',
  ],
  client: ['clientName', 'contactName', 'contactEmail'],
  location: ['address', 'city', 'country', 'latitude', 'longitude'],
};

// The selects offer every stored value, so the form accepts any stored project (P3 core spec §4.1).
const PROJECT_STATUSES = STATUS_OPTIONS.map((option) => option.value);
const PROJECT_STAGES = STAGE_OPTIONS.map((option) => option.value);
const PROJECT_TYPES = PROJECT_TYPE_OPTIONS.map((option) => option.value);
const PROJECT_SECTORS = SECTOR_OPTIONS.map((option) => option.value);

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

/** Up to 6 decimal places, about 0.1 m (P3 core spec §6.5). */
const COORDINATE_MAX_DECIMALS = 6;

/** The coordinate fields with their ranges and range copy (P3 core spec §6.5). */
const COORDINATE_FIELDS = [
  { name: 'latitude', limit: 90, message: 'Enter a latitude between -90 and 90' },
  { name: 'longitude', limit: 180, message: 'Enter a longitude between -180 and 180' },
] as const;

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

/** The error of one filled coordinate field: not a number or out of range first, then decimals. */
function coordinateError(text: string, limit: number, rangeMessage: string): string | null {
  const value = parseCoordinate(text);
  if (value === null) return null;
  if (Number.isNaN(value) || Math.abs(value) > limit) return rangeMessage;
  if (coordinateDecimals(text) > COORDINATE_MAX_DECIMALS) return 'Use up to 6 decimal places';
  return null;
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
    status: z.enum(PROJECT_STATUSES),
    stage: z.union([z.enum(PROJECT_STAGES), z.literal('')]),
    projectType: z.union([z.enum(PROJECT_TYPES), z.literal('')]),
    sector: z.union([z.enum(PROJECT_SECTORS), z.literal('')]),
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
    latitude: z.string(),
    longitude: z.string(),
  })
  .superRefine((values, ctx) => {
    const { startDate, plannedFinishDate } = values;
    if (isIsoDate(startDate) && isIsoDate(plannedFinishDate)) {
      if (isBefore(parseISO(plannedFinishDate), parseISO(startDate))) {
        ctx.addIssue({
          code: 'custom',
          path: ['plannedFinishDate'],
          message: 'Finish must be on or after the start date',
        });
      }
    }
    // Both coordinates or neither; the "both" error goes on the empty one (P3 core spec §6.5).
    const filled = COORDINATE_FIELDS.filter(({ name }) => values[name].trim() !== '').length;
    for (const { name, limit, message } of COORDINATE_FIELDS) {
      const text = values[name];
      let error: string | null;
      if (text.trim() !== '') error = coordinateError(text, limit, message);
      else error = filled === 1 ? 'Enter both latitude and longitude' : null;
      if (error !== null) ctx.addIssue({ code: 'custom', path: [name], message: error });
    }
  }) satisfies z.ZodType<ProjectFormValues, ProjectFormValues>;

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The create request for the form's values: strings trimmed, empty optional values `null`, and the
 * coordinates as numbers read with either decimal mark.
 */
export function toNewProjectInput(values: ProjectFormValues, workspaceId: ID): NewProjectInput {
  return {
    workspaceId,
    code: values.code.trim(),
    name: values.name.trim(),
    description: textOrNull(values.description),
    coverImage: values.coverImage,
    statusDate: textOrNull(values.statusDate),
    attributes: {
      status: values.status,
      stage: values.stage === '' ? null : values.stage,
      projectType: values.projectType === '' ? null : values.projectType,
      sector: values.sector === '' ? null : values.sector,
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
      latitude: parseCoordinate(values.latitude),
      longitude: parseCoordinate(values.longitude),
    },
  };
}
