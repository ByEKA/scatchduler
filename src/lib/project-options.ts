import type { ProjectSector, ProjectStage, ProjectStatus, ProjectType } from '@/data/types';

/** A stored value and the label the app shows for it. */
export interface Option<T extends string> {
  value: T;
  label: string;
}

/** The Status options in the order selects list them (P3 core spec §6.4). */
export const STATUS_OPTIONS: ReadonlyArray<Option<ProjectStatus>> = [
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/** The Stage options in order; selects put "None" before them (P3 core spec §6.4). */
export const STAGE_OPTIONS: ReadonlyArray<Option<ProjectStage>> = [
  { value: 'pursuit', label: 'Pursuit' },
  { value: 'preconstruction', label: 'Preconstruction' },
  { value: 'construction', label: 'Construction' },
  { value: 'closeout', label: 'Closeout' },
  { value: 'completed', label: 'Completed' },
];

/** The Project type options: P1's order with the new types before "Other" (P3 full §6.6). */
export const PROJECT_TYPE_OPTIONS: ReadonlyArray<Option<ProjectType>> = [
  { value: 'building', label: 'Building' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'residential', label: 'Residential' },
  { value: 'energy', label: 'Energy' },
  { value: 'transportation', label: 'Transportation' },
  { value: 'water', label: 'Water' },
  { value: 'other', label: 'Other' },
];

/** The Sector (ownership) options in order (P3 core spec §6.4, D2). */
export const SECTOR_OPTIONS: ReadonlyArray<Option<ProjectSector>> = [
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
  { value: 'public_private', label: 'Public–private partnership' },
];

/** True when `value` is the value of one of `options`. */
export function isOptionValue<T extends string>(
  options: ReadonlyArray<Option<T>>,
  value: unknown,
): value is T {
  return options.some((option) => option.value === value);
}

/** The label of `value`; "—" for no value (P3 core spec §6.1). */
export function optionLabel<T extends string>(
  options: ReadonlyArray<Option<T>>,
  value: T | null,
): string {
  if (value === null) return '—';
  return options.find((option) => option.value === value)?.label ?? '—';
}
