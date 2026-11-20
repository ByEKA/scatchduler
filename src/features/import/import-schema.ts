import type {
  ImportDateFormat,
  ImportField,
  ImportFormat,
  TableMapping,
  TextEncodingName,
} from '@/data/types';

/** All table import fields in the order spec §6.4 shows them. */
export const IMPORT_FIELD_ORDER: readonly ImportField[] = [
  'code',
  'name',
  'taskId',
  'wbs',
  'duration',
  'start',
  'finish',
  'actualStart',
  'actualFinish',
  'activityType',
  'calendar',
  'constraintType',
  'constraintDate',
  'percentComplete',
  'predecessors',
  'notes',
];

/** Display labels for every mapped table field (spec §6.4). */
export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  code: 'Activity code',
  name: 'Activity name',
  taskId: 'Task ID',
  wbs: 'WBS',
  duration: 'Duration',
  start: 'Start',
  finish: 'Finish',
  actualStart: 'Actual start',
  actualFinish: 'Actual finish',
  activityType: 'Activity type',
  calendar: 'Calendar',
  constraintType: 'Constraint',
  constraintDate: 'Constraint date',
  percentComplete: '% complete',
  predecessors: 'Predecessors',
  notes: 'Notes',
};

export type ColumnErrorKey = ImportField | 'headerRow' | 'hoursPerDay';

export const ENCODING_LABELS: Record<TextEncodingName, string> = {
  'utf-8': 'UTF-8',
  'windows-1254': 'Turkish (Windows-1254)',
  'windows-1252': 'Western European (Windows-1252)',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
};

export const BOM_ENCODING_LABELS: Partial<Record<TextEncodingName, string>> = {
  'utf-8': 'UTF-8 (byte-order mark)',
  'utf-16le': 'UTF-16 LE (byte-order mark)',
  'utf-16be': 'UTF-16 BE (byte-order mark)',
};

export const TEXT_ENCODING_OPTIONS: ReadonlyArray<{ value: TextEncodingName; label: string }> = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'windows-1254', label: 'Turkish (Windows-1254)' },
  { value: 'windows-1252', label: 'Western European (Windows-1252)' },
];

export const DELIMITER_OPTIONS: ReadonlyArray<{ value: ',' | ';' | '\t'; label: string }> = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
];

export const DECIMAL_OPTIONS: ReadonlyArray<{ value: ',' | '.'; label: string }> = [
  { value: ',', label: 'Comma (2,5)' },
  { value: '.', label: 'Period (2.5)' },
];

export const DATE_FORMAT_OPTIONS: ReadonlyArray<{ value: ImportDateFormat; label: string }> = [
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

export const DURATION_UNIT_OPTIONS: ReadonlyArray<{ value: 'days' | 'hours'; label: string }> = [
  { value: 'days', label: 'Days' },
  { value: 'hours', label: 'Hours' },
];

export const PREDECESSOR_REF_OPTIONS: ReadonlyArray<{ value: 'code' | 'taskId'; label: string }> = [
  { value: 'code', label: 'Activity code' },
  { value: 'taskId', label: 'Task ID' },
];

export const ROWS_WITH_PROBLEMS_OPTIONS: ReadonlyArray<{ value: 'keep' | 'skip'; label: string }> =
  [
    { value: 'keep', label: 'Import them, leaving bad cells empty' },
    { value: 'skip', label: 'Skip them' },
  ];

/** Spreadsheet column letter for a 0-based index: 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Human-readable format name shown on the File, Review and Import report screens (spec §6.4). */
export function formatDisplayName(format: ImportFormat, version?: string | null): string {
  switch (format) {
    case 'xer':
      return version ? `Primavera P6 XER ${version}` : 'Primavera P6 XER';
    case 'mspdi':
      return 'Microsoft Project XML';
    case 'xlsx':
      return 'Excel workbook';
    case 'csv':
      return 'CSV file';
  }
}

/**
 * Checks the Columns step before advancing to Review (spec §6.5 "Import · Columns"):
 * - Header row must be an integer 1–50
 * - Hours per day must be a finite number 1–24
 * - Activity code and Activity name must be mapped
 * - Task ID must be mapped when Predecessors refer to Task ID
 * - Each column index can be mapped to at most one field
 */
export function checkColumns(table: TableMapping): Partial<Record<ColumnErrorKey, string>> {
  const errors: Partial<Record<ColumnErrorKey, string>> = {};

  if (!Number.isInteger(table.headerRow) || table.headerRow < 1 || table.headerRow > 50) {
    errors.headerRow = 'Enter a row number from 1 to 50';
  }
  if (!Number.isFinite(table.hoursPerDay) || table.hoursPerDay < 1 || table.hoursPerDay > 24) {
    errors.hoursPerDay = 'Enter hours per day from 1 to 24';
  }

  if (table.columns.code === undefined) {
    errors.code = 'Map a column to Activity code';
  }
  if (table.columns.name === undefined) {
    errors.name = 'Map a column to Activity name';
  }
  if (table.predecessorRef === 'taskId' && table.columns.taskId === undefined) {
    errors.taskId = 'Map a column to Task ID';
  }

  const indexCounts = new Map<number, number>();
  for (const field of IMPORT_FIELD_ORDER) {
    const mapped = table.columns[field];
    if (mapped !== undefined) {
      indexCounts.set(mapped.index, (indexCounts.get(mapped.index) ?? 0) + 1);
    }
  }
  for (const field of IMPORT_FIELD_ORDER) {
    const mapped = table.columns[field];
    if (mapped !== undefined && (indexCounts.get(mapped.index) ?? 0) > 1) {
      errors[field] = 'Each column can be used once';
    }
  }

  return errors;
}

/** Display labels for the four entity rows of the report Counts table (spec §6.4). */
export const COUNT_ENTITY_LABELS: Record<'calendar' | 'wbs' | 'activity' | 'relationship', string> =
  {
    calendar: 'Calendars',
    wbs: 'WBS elements',
    activity: 'Activities',
    relationship: 'Relationships',
  };

export const COUNT_ENTITY_ORDER = ['calendar', 'wbs', 'activity', 'relationship'] as const;

/** Display labels for the nine checks in spec §6.4 order. */
export const CHECK_LABELS: Record<
  | 'actual_after_status_date'
  | 'progress_without_actual_start'
  | 'complete_without_actual_finish'
  | 'status_date_fallback'
  | 'ambiguous_milestones'
  | 'percent_lags'
  | 'links_on_summaries'
  | 'external_links'
  | 'project_dates_differ',
  string
> = {
  actual_after_status_date: 'Actual dates after the status date',
  progress_without_actual_start: 'Progress without an actual start',
  complete_without_actual_finish: 'Completed without an actual finish',
  status_date_fallback: 'Status date filled in',
  ambiguous_milestones: 'Milestones at an unclear time',
  percent_lags: 'Percentage lags',
  links_on_summaries: 'Links on summary tasks',
  external_links: 'Links to other projects or files',
  project_dates_differ: 'Project dates differ from activity dates',
};

/** Issue codes corresponding to each check, used to jump to / expand its group. */
export const CHECK_ISSUE_CODES: Record<keyof typeof CHECK_LABELS, readonly string[]> = {
  actual_after_status_date: ['ACTUAL_AFTER_STATUS_DATE'],
  progress_without_actual_start: ['PROGRESS_WITHOUT_ACTUAL_START'],
  complete_without_actual_finish: ['COMPLETE_WITHOUT_ACTUAL_FINISH'],
  status_date_fallback: ['STATUS_DATE_FALLBACK'],
  ambiguous_milestones: ['MSPDI_MILESTONE_AMBIGUOUS'],
  percent_lags: ['PERCENT_LAG'],
  links_on_summaries: ['MSPDI_SUMMARY_LINK'],
  external_links: ['XER_CROSS_PROJECT_LINK', 'MSPDI_EXTERNAL_LINK'],
  project_dates_differ: ['PROJECT_DATES_DIFFER'],
};

export const OUTCOME_GROUP_LABELS = {
  used: 'Used for dates',
  kept: 'Kept for display and export',
  not_read: 'Not read; still in the original file',
} as const;

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  task: 'Task',
  start_milestone: 'Start milestone',
  finish_milestone: 'Finish milestone',
  level_of_effort: 'Level of effort',
  wbs_summary: 'WBS summary',
};

/** Group titles matching spec §5.12 without importing `@/import/issues` across the S7 boundary. */
export const ISSUE_GROUP_TITLES: Readonly<Record<string, string>> = {
  FILE_EMPTY: 'Empty file',
  FILE_UNREADABLE: "File couldn't be read",
  FILE_NO_ACTIVITIES: 'No activities',
  FILE_TOO_MANY_ACTIVITIES: 'Too many activities',
  FILE_TOO_MANY_RELATIONSHIPS: 'Too many relationships',
  FILE_TOO_MANY_WBS: 'Too many WBS elements',
  FILE_TOO_MANY_CALENDARS: 'Too many calendars',
  FILE_TOO_MANY_EXCEPTIONS: 'Too many calendar exceptions',
  FILE_TOO_MANY_ROWS: 'Too many rows',
  FILE_TOO_MANY_COLUMNS: 'Too many columns',
  TABLE_TOO_MANY_CALENDARS: 'Too many calendars',
  DUPLICATE_CODE: 'Repeated activity codes',
  CALENDAR_UNREADABLE: "Calendars that couldn't be read",
  CALENDAR_BASE_MISSING: 'Calendars without their base',
  CALENDAR_RECURRENCE_UNSUPPORTED: "Repeating exceptions we can't read",
  FORMAT_FROM_CONTENT: 'File type taken from the content',
  ENCODING_GUESSED: 'Text encoding',
  ENCODING_INVALID_BYTES: 'Text encoding',
  XER_MULTIPLE_PROJECTS: 'Several projects in the file',
  XER_CROSS_PROJECT_LINK: 'Links to other projects',
  XER_RESOURCE_TASK: 'Resource-dependent activities',
  XER_EXPECTED_FINISH: 'Expected finish dates',
  XER_CALENDAR_BASE_MISSING: 'Calendars read without their base',
  XER_UNKNOWN_VALUE: 'Unknown values',
  XER_DECIMAL_COMMA: 'Decimal commas',
  CALENDAR_UNUSED_SKIPPED: 'Unused calendars skipped',
  CALENDAR_RECURRENCE_CAPPED: 'Long repeating exceptions',
  CALENDAR_MISSING: 'Activities without a calendar',
  CALENDAR_HOURS_MISMATCH: 'Calendar hours',
  CALENDAR_DATA_REPAIRED: 'Repaired calendars',
  CALENDAR_GENERATED_STANDARD: 'Generated calendars',
  CALENDAR_GENERATED_FROM_NAME: 'Generated calendars',
  CALENDAR_GENERATED_ELAPSED: 'Generated calendars',
  MSPDI_SUMMARY_LINK: 'Links on summary tasks',
  MSPDI_MILESTONE_WITH_DURATION: 'Milestones with a duration',
  MSPDI_MILESTONE_AMBIGUOUS: 'Milestones at an unclear time',
  MSPDI_ZERO_DURATION: 'Tasks without a duration',
  MSPDI_MANUAL_TASK: 'Manually scheduled tasks',
  MSPDI_MANUAL_START_DROPPED: 'Manually scheduled tasks',
  MSPDI_INACTIVE_TASK: 'Inactive tasks',
  MSPDI_EXTERNAL_TASK: 'External tasks',
  MSPDI_EXTERNAL_LINK: 'Links outside the file',
  MSPDI_WORK_WEEKS: 'Alternate work weeks',
  MSPDI_NO_NAMESPACE: 'Non-standard Microsoft Project XML',
  MSPDI_DATE_ZONE_DROPPED: 'Non-standard Microsoft Project XML',
  CODE_FALLBACK: 'Activities without a usable code',
  XML_BAD_CHARACTER: 'Invalid characters',
  ELAPSED_DURATION: 'Elapsed durations',
  ELAPSED_LAG: 'Elapsed lags',
  PERCENT_LAG: 'Percentage lags',
  LINK_TYPE_UNKNOWN: 'Unknown link types',
  STATUS_DATE_MISSING: 'Status date',
  STATUS_DATE_FALLBACK: 'Status date',
  STATUS_TIME_KEPT: 'Status date',
  ACTUAL_AFTER_STATUS_DATE: 'Actual dates after the status date',
  PROGRESS_WITHOUT_ACTUAL_START: 'Progress without an actual start',
  COMPLETE_WITHOUT_ACTUAL_FINISH: 'Completed without an actual finish',
  PROJECT_DATES_DIFFER: 'Project dates',
  TABLE_MISSING_CODE: 'Rows without an activity code',
  TABLE_MISSING_NAME: 'Activities without a name',
  TABLE_BAD_NUMBER: 'Unreadable numbers',
  TABLE_BAD_DURATION: 'Unreadable durations',
  TABLE_ESTIMATED_DURATION: 'Estimated durations',
  TABLE_BAD_DATE: 'Unreadable dates',
  TABLE_UNKNOWN_TYPE: 'Unknown activity types',
  TABLE_BAD_LINK: 'Unreadable links',
  TABLE_ROW_SKIPPED: 'Rows skipped',
  LINK_UNKNOWN_ACTIVITY: 'Links to missing activities',
  LINK_SELF: 'Activities linked to themselves',
  LINK_DUPLICATE: 'Repeated links',
  CONSTRAINT_UNSUPPORTED: 'Unsupported constraints',
  TEXT_TRUNCATED: 'Shortened text',
};

export function activityCodeFieldLabel(field: string | null): string {
  if (field === null || field === 'UID') return 'Unique ID';
  return field;
}

export const BLOCKED_ERRORS_MESSAGE =
  "Fix the errors before importing. This schedule can't be imported as it is.";
export const CHOOSE_SCHEDULE_MESSAGE = 'Choose at least one schedule to import.';
