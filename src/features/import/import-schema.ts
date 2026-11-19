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
