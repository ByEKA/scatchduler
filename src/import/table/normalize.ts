import type {
  ImportCount,
  ImportDateFormat,
  ImportField,
  ImportIssue,
  ImportReport,
  TableAssumptions,
  TableMapping,
} from '@/data/types';
import { foldForMatch } from '@/lib/search';
import {
  calendarFromName,
  ELAPSED_CALENDAR_ID,
  elapsedCalendar,
  STANDARD_CALENDAR_ID,
  standardCalendar,
  standardStartTime,
} from '../calendars';
import {
  excelSerialToWallClock,
  guessDateFormat,
  isExcelSerialInRange,
  parseTableDate,
  type TableDate,
} from '../dates';
import { parseDuration } from '../durations';
import { makeIssue, sliceText } from '../issues';
import {
  emptyModel,
  type ImportActivity,
  type ImportConstraintType,
  type ImportRelationship,
  type WallClock,
} from '../model';
import { guessDecimalSeparator, parseNumber } from '../numbers';
import type { ReadResult } from '../read-result';
import { autoMap } from './auto-map';
import { parseConstraint } from './constraints';
import { chooseReading, predecessorReadings, type PredecessorReadings } from './predecessors';

// The table normalizer (P3 core spec §5.7, §5.4): one reading of a CSV or xlsx source through a
// column mapping, shared by the Columns step's preview and `analyze`.

/**
 * A cell as the sources hand it over: text (every CSV cell, xlsx text, booleans and errors), an
 * xlsx number (`percent` when its format shows %, the value read × 100) or an xlsx date serial
 * (`showsTime` when its number format shows a time of day, D58).
 */
export type TableCell =
  | { kind: 'text'; text: string }
  | { kind: 'number'; value: number; percent: boolean }
  | { kind: 'date'; serial: number; showsTime?: true };

export interface TableSource {
  rows: Array<Array<TableCell | null>>; // rows with at least one non-empty cell, in file order
  rowNumbers: number[]; // the 1-based CSV line or sheet row of each of `rows`
  sheets: string[]; // xlsx: every sheet of the workbook; CSV: none
  sheet: string | null; // xlsx: the sheet read
  date1904: boolean;
}

export interface TablePreview {
  headers: string[];
  rows: Array<{ rowNumber: number; cells: Array<{ text: string; invalid: boolean }> }>;
}

/** The fixed values of schemaVersion 1 (§4.1). */
export const TABLE_ASSUMPTIONS: TableAssumptions = Object.freeze({
  duration: 'original',
  startFinish: 'planned',
  percentComplete: 'duration',
  dateOnlyStart: '08:00',
  dateOnlyFinish: '17:00',
  weekUnitDays: 5,
  defaultWorkWeek: 'mon-fri',
} as const);

const TEXT_LIMITS = { code: 40, name: 255, notes: 4000 } as const;
const MAX_HEADER_ROW = 50;
const PREVIEW_ROWS = 10;
// Detection samples the first data rows only.
const GUESS_ROWS = 1000;
// A WBS path deeper than this is read as one code: splitting it would cost time quadratic in its
// length.
const MAX_WBS_LEVELS = 100;
const DATE_FORMATS: readonly ImportDateFormat[] = [
  'YYYY-MM-DD',
  'DD.MM.YYYY',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
];
const ACTIVITY_TYPES: ReadonlyMap<string, ImportActivity['type']> = new Map(
  (
    [
      ['task', 'task'],
      ['görev', 'task'],
      ['milestone', 'start_milestone'],
      ['start milestone', 'start_milestone'],
      ['kilometre taşı', 'start_milestone'],
      ['finish milestone', 'finish_milestone'],
      ['level of effort', 'level_of_effort'],
    ] as const
  ).map(([name, type]) => [foldForMatch(name), type]),
);
const FINISH_CONSTRAINTS: ReadonlySet<ImportConstraintType> = new Set([
  'finish_on',
  'finish_on_or_after',
  'finish_on_or_before',
  'mandatory_finish',
]);
// Report elements (OUTCOME_CATALOG's table entries) in catalog order, by the field they come from.
const FIELD_ELEMENTS: ReadonlyArray<[ImportField, string]> = [
  ['code', 'Activity code'],
  ['name', 'Activity name'],
  ['duration', 'Duration'],
  ['start', 'Start'],
  ['finish', 'Finish'],
  ['actualStart', 'Actual start'],
  ['actualFinish', 'Actual finish'],
  ['activityType', 'Activity type'],
  ['calendar', 'Calendar'],
  ['constraintType', 'Constraint'],
  ['constraintDate', 'Constraint date'],
  ['percentComplete', '% complete'],
  ['predecessors', 'Predecessors'],
  ['taskId', 'Task ID'],
  ['wbs', 'WBS'],
  ['notes', 'Notes'],
];

// ---------------------------------------------------------------------------------------------
// Cells and rows

/** True for a missing cell and for text of only white space. */
export function isEmptyCell(cell: TableCell | null | undefined): boolean {
  return cell == null || (cell.kind === 'text' && cell.text.trim() === '');
}

export function isEmptyRow(cells: ReadonlyArray<TableCell | null | undefined>): boolean {
  return cells.every(isEmptyCell);
}

/** 0 → 'A', 25 → 'Z', 26 → 'AA'. */
export function columnLetter(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/** Rounds away binary noise: 0.07 × 100 is 7.000000000000001. */
function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function isDateOnly(cell: { serial: number; showsTime?: true }): boolean {
  return Number.isInteger(cell.serial) && cell.showsTime !== true;
}

/** A date cell as a table date: an integer serial without a time format is a date only (D58). */
function serialDate(
  cell: { serial: number; showsTime?: true },
  date1904: boolean,
): TableDate | null {
  if (!isExcelSerialInRange(cell.serial, date1904)) return null;
  const clock = excelSerialToWallClock(cell.serial, date1904);
  return { date: clock.slice(0, 10), time: isDateOnly(cell) ? null : clock.slice(11, 16) };
}

/** The text a cell shows in the preview, the headers and issues. */
function cellText(cell: TableCell | null | undefined, date1904: boolean): string {
  if (cell == null) return '';
  switch (cell.kind) {
    case 'text':
      return cell.text;
    case 'number':
      return cell.percent ? `${tidy(cell.value * 100)}%` : String(cell.value);
    case 'date': {
      const date = serialDate(cell, date1904);
      if (date === null) return String(cell.serial);
      return date.time === null ? date.date : `${date.date} ${date.time}`;
    }
  }
}

function rowNumberOf(source: TableSource, index: number): number {
  return source.rowNumbers[index] ?? index + 1;
}

/** The rows after the header row, with their numbers; rows of only empty cells are left out. */
function dataRows(
  source: TableSource,
  headerRow: number,
): Array<{ number: number; cells: ReadonlyArray<TableCell | null> }> {
  const rows: Array<{ number: number; cells: ReadonlyArray<TableCell | null> }> = [];
  source.rows.forEach((cells, index) => {
    const number = rowNumberOf(source, index);
    if (number > headerRow && !isEmptyRow(cells)) rows.push({ number, cells });
  });
  return rows;
}

/** 1-based: the first row with at least two non-empty text cells, within the first 50; else 1. */
export function headerRowGuess(source: TableSource): number {
  for (let index = 0; index < source.rows.length; index += 1) {
    const number = rowNumberOf(source, index);
    if (number > MAX_HEADER_ROW) break;
    const texts = (source.rows[index] ?? []).filter(
      (cell) => cell?.kind === 'text' && cell.text.trim() !== '',
    );
    if (texts.length >= 2) return number;
  }
  return 1;
}

/**
 * The header row's texts, one per column up to the last column with a header or any data: empty
 * trailing columns aren't offered (Review Focus 2).
 */
function headersOf(source: TableSource, headerRow: number): string[] {
  const index = source.rows.findIndex((_, i) => rowNumberOf(source, i) === headerRow);
  const header = index < 0 ? [] : (source.rows[index] ?? []);
  let width = 0;
  const widen = (cells: ReadonlyArray<TableCell | null>) => {
    for (let column = cells.length - 1; column >= width; column -= 1) {
      if (!isEmptyCell(cells[column])) {
        width = column + 1;
        break;
      }
    }
  };
  widen(header);
  for (const row of dataRows(source, headerRow)) widen(row.cells);
  return Array.from({ length: width }, (_, column) =>
    cellText(header[column], source.date1904).trim(),
  );
}

/** The first format reading every sample some format can read; DD.MM.YYYY without samples. */
function guessTableDateFormat(samples: readonly string[]): ImportDateFormat {
  return guessDateFormat(
    samples.filter((sample) =>
      DATE_FORMATS.some((format) => {
        const date = parseTableDate(sample, format);
        return date !== null && date !== 'invalid';
      }),
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Mapping

/**
 * The detected mapping: the guessed header row, automatic columns, the decimal separator and date
 * format guessed from the mapped duration, % complete and date cells of the data rows.
 */
export function defaultTableMapping(
  source: TableSource,
  options: { delimiter: ',' | ';' | '\t' | null },
): TableMapping {
  const headerRow = headerRowGuess(source);
  const columns = autoMap(headersOf(source, headerRow));
  const samples = dataRows(source, headerRow).slice(0, GUESS_ROWS);
  const texts = (fields: readonly ImportField[]) =>
    samples.flatMap(({ cells }) =>
      fields.flatMap((field) => {
        const column = columns[field];
        const cell = column === undefined ? null : cells[column.index];
        return cell?.kind === 'text' && cell.text.trim() !== '' ? [cell.text.trim()] : [];
      }),
    );
  return {
    sheet: source.sheet,
    headerRow,
    delimiter: options.delimiter,
    decimalSeparator: guessDecimalSeparator(texts(['duration', 'percentComplete'])),
    dateFormat: guessTableDateFormat(
      texts(['start', 'finish', 'actualStart', 'actualFinish', 'constraintDate']),
    ),
    durationUnit: 'days',
    hoursPerDay: 8,
    predecessorRef: columns.taskId === undefined ? 'code' : 'taskId',
    skipRowsWithIssues: false,
    columns,
    assumptions: TABLE_ASSUMPTIONS,
  };
}

// ---------------------------------------------------------------------------------------------
// Reading one row

type BadCellCode = 'TABLE_BAD_NUMBER' | 'TABLE_BAD_DURATION' | 'TABLE_BAD_DATE';

interface ParsedRow {
  code: string; // '' when missing
  taskId: string | null;
  name: string | null;
  wbs: string | null;
  duration: { minutes: number; elapsed: boolean; estimated: boolean } | null;
  start: TableDate | null;
  finish: TableDate | null;
  actualStart: TableDate | null;
  actualFinish: TableDate | null;
  type: ImportActivity['type'];
  unknownType: string | null;
  calendar: string | null;
  constraint: ImportConstraintType | null;
  unsupportedConstraint: string | null;
  constraintDate: TableDate | null;
  percent: number | null;
  predecessors: PredecessorReadings[]; // each token's readings, chosen once the codes are known
  notes: string | null;
  bad: Array<{ column: number; code: BadCellCode; value: string }>; // unreadable cells, left empty
  invalid: Set<number>; // the columns the preview marks
}

function parseRow(
  cells: ReadonlyArray<TableCell | null>,
  mapping: TableMapping,
  date1904: boolean,
): ParsedRow {
  const bad: ParsedRow['bad'] = [];
  const invalid = new Set<number>();
  const cellOf = (field: ImportField): { cell: TableCell; column: number } | null => {
    const column = mapping.columns[field]?.index;
    const cell = column === undefined ? null : cells[column];
    return column === undefined || cell == null || isEmptyCell(cell) ? null : { cell, column };
  };
  const markBad = (column: number, code: BadCellCode, cell: TableCell) => {
    bad.push({ column, code, value: cellText(cell, date1904).trim() });
    invalid.add(column);
  };
  const text = (field: ImportField): string | null => {
    const found = cellOf(field);
    return found === null ? null : cellText(found.cell, date1904).trim();
  };

  const percentComplete = (): number | null => {
    const found = cellOf('percentComplete');
    if (found === null) return null;
    const { cell, column } = found;
    let value = NaN;
    if (cell.kind === 'number') value = cell.percent ? tidy(cell.value * 100) : cell.value;
    else if (cell.kind === 'text') value = parseNumber(cell.text, mapping.decimalSeparator) ?? NaN;
    if (Number.isFinite(value) && value >= 0 && value <= 100) return value;
    markBad(column, 'TABLE_BAD_NUMBER', cell);
    return null;
  };

  const duration = (): ParsedRow['duration'] => {
    const found = cellOf('duration');
    if (found === null) return null;
    const { cell, column } = found;
    if (cell.kind === 'number' && cell.value >= 0) {
      const unitMinutes = mapping.durationUnit === 'hours' ? 60 : mapping.hoursPerDay * 60;
      return { minutes: Math.round(cell.value * unitMinutes), elapsed: false, estimated: false };
    }
    if (cell.kind === 'text') {
      const parsed = parseDuration(cell.text, {
        unit: mapping.durationUnit,
        hoursPerDay: mapping.hoursPerDay,
        decimal: mapping.decimalSeparator,
      });
      if (parsed.kind === 'ok') return parsed;
    }
    markBad(column, 'TABLE_BAD_DURATION', cell);
    return null;
  };

  const date = (field: ImportField): TableDate | null => {
    const found = cellOf(field);
    if (found === null) return null;
    const { cell, column } = found;
    let parsed: TableDate | null = null;
    if (cell.kind === 'date') parsed = serialDate(cell, date1904);
    else if (cell.kind === 'text') {
      const value = parseTableDate(cell.text, mapping.dateFormat);
      parsed = value === 'invalid' ? null : value;
    }
    if (parsed === null) markBad(column, 'TABLE_BAD_DATE', cell);
    return parsed;
  };

  // Activity type: empty is a task; an unknown value is a task with TABLE_UNKNOWN_TYPE.
  const typeText = text('activityType');
  const knownType =
    typeText === null ? 'task' : ACTIVITY_TYPES.get(foldForMatch(typeText).replace(/\s+/g, ' '));
  if (knownType === undefined) invalid.add(mapping.columns.activityType?.index ?? -1);

  const constraintText = text('constraintType');
  const constraint = constraintText === null ? 'none' : parseConstraint(constraintText);
  if (constraint === null) invalid.add(mapping.columns.constraintType?.index ?? -1);

  const predecessorsText = text('predecessors');
  const predecessors =
    predecessorsText === null
      ? []
      : predecessorReadings(predecessorsText, {
          decimal: mapping.decimalSeparator,
          hoursPerDay: mapping.hoursPerDay,
          unit: mapping.durationUnit,
        });
  if (predecessors.some((token) => token.readings.length === 0)) {
    invalid.add(mapping.columns.predecessors?.index ?? -1);
  }

  // `bad` is sorted into column order below: its first entry is the leftmost unreadable cell.
  const parsed: ParsedRow = {
    code: text('code') ?? '',
    taskId: text('taskId'),
    name: text('name'),
    wbs: text('wbs'),
    duration: duration(),
    start: date('start'),
    finish: date('finish'),
    actualStart: date('actualStart'),
    actualFinish: date('actualFinish'),
    type: knownType ?? 'task',
    unknownType: knownType === undefined ? typeText : null,
    calendar: text('calendar'),
    constraint: constraint === 'none' || constraint === null ? null : constraint,
    unsupportedConstraint: constraint === null ? constraintText : null,
    constraintDate: date('constraintDate'),
    percent: percentComplete(),
    predecessors,
    notes: text('notes'),
    bad,
    invalid,
  };
  bad.sort((a, b) => a.column - b.column);
  return parsed;
}

// ---------------------------------------------------------------------------------------------
// The reader

function wallClockOf(date: TableDate | null, dateOnlyTime: string): WallClock | null {
  return date === null ? null : `${date.date}T${date.time ?? dateOnlyTime}`;
}

function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function hoursText(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${noNegativeZero(hours).toLocaleString('en-US')} h`;
}

function emptyCount(entity: ImportCount['entity']): ImportCount {
  return { entity, read: 0, accepted: 0, adjusted: 0, skipped: 0 };
}

/**
 * Reads the data rows through the mapping. Rows of only empty cells are ignored; a row without a
 * code is skipped (TABLE_MISSING_CODE); an unreadable cell is left empty and adjusts the activity,
 * or with `skipRowsWithIssues` skips the row (TABLE_ROW_SKIPPED). Generated calendars stay out of
 * the calendar count (D43).
 */
export function readTable(
  source: TableSource,
  mapping: TableMapping,
  meta: { format: 'xlsx' | 'csv'; encoding: ImportReport['encoding'] },
): ReadResult {
  const { date1904 } = source;
  const assumptions = TABLE_ASSUMPTIONS;
  const model = emptyModel(meta.format);
  const issues: ImportIssue[] = [];
  const headers = headersOf(source, mapping.headerRow);
  const columnName = (column: number) => headers[column] || columnLetter(column);
  /** `Line {n}` for CSV, `{sheet}!{cell}` for xlsx (the row, `{sheet}!{n}:{n}`, without a column). */
  const locate = (row: number, column: number | null | undefined): string => {
    if (meta.format === 'csv') return `Line ${row}`;
    const sheet = source.sheet ?? mapping.sheet ?? '';
    return column == null ? `${sheet}!${row}:${row}` : `${sheet}!${columnLetter(column)}${row}`;
  };
  const columnOf = (field: ImportField) => mapping.columns[field]?.index ?? null;

  // The generated "Standard" calendar, the project's default, always (§5.7, D61).
  const startTime = standardStartTime(mapping.hoursPerDay);
  model.calendars.push(standardCalendar(mapping.hoursPerDay));
  model.project.defaultCalendarId = STANDARD_CALENDAR_ID;
  issues.push(
    makeIssue('CALENDAR_GENERATED_STANDARD', { start: startTime, n: mapping.hoursPerDay }),
  );
  const generatedNames = new Set<string>([STANDARD_CALENDAR_ID]);
  let elapsedUsed = false;

  const wbsCount = emptyCount('wbs');
  const activityCount = emptyCount('activity');
  const relationshipCount = emptyCount('relationship');

  // ---- WBS: a code, or a path split on '.', '/' or '>'; each distinct prefix is one element ---
  const wbsByKey = new Map<string, string>();
  const wbsSiblings = new Map<string | null, number>();
  const wbsIdOf = (text: string, location: string): string | null => {
    const parts: Array<{ segment: string; end: number }> = [];
    const pattern = /[^./>]+/g;
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const segment = match[0].trim();
      if (segment !== '') parts.push({ segment, end: match.index + match[0].length });
    }
    const levels = parts.length > MAX_WBS_LEVELS ? [{ segment: text, end: text.length }] : parts;
    let parentId: string | null = null;
    let key = '';
    for (const { segment, end } of levels) {
      key = parentId === null ? segment : `${key}\u0000${segment}`;
      let id = wbsByKey.get(key);
      if (id === undefined) {
        id = text.slice(0, end).trim();
        let name = segment;
        if (name.length > TEXT_LIMITS.name) {
          issues.push(
            makeIssue(
              'TEXT_TRUNCATED',
              { field: 'name', code: id, n: TEXT_LIMITS.name },
              { location, original: name },
            ),
          );
          name = sliceText(name, TEXT_LIMITS.name);
          wbsCount.adjusted += 1;
        }
        const order = wbsSiblings.get(parentId) ?? 0;
        wbsSiblings.set(parentId, order + 1);
        model.wbs.push({ id, parentId, code: id, name, order });
        wbsByKey.set(key, id);
        wbsCount.read += 1;
        wbsCount.accepted += 1;
      }
      parentId = id;
    }
    return parentId;
  };

  // ---- Activities, in row order --------------------------------------------------------------
  const accepted: Array<{ row: ParsedRow; activity: ImportActivity; location: string }> = [];
  const acceptedCells: Array<ReadonlyArray<TableCell | null>> = [];
  const seenCodes = new Set<string>();
  const reportedCodes = new Set<string>();

  for (const { number, cells } of dataRows(source, mapping.headerRow)) {
    activityCount.read += 1;
    const row = parseRow(cells, mapping, date1904);
    if (row.code === '') {
      issues.push(
        makeIssue('TABLE_MISSING_CODE', {}, { location: locate(number, columnOf('code')) }),
      );
      activityCount.skipped += 1;
      continue;
    }
    const firstBad = row.bad[0];
    if (mapping.skipRowsWithIssues && firstBad !== undefined) {
      issues.push(
        makeIssue(
          'TABLE_ROW_SKIPPED',
          { value: firstBad.value, column: columnName(firstBad.column) },
          { location: locate(number, firstBad.column), original: firstBad.value },
        ),
      );
      activityCount.skipped += 1;
      continue;
    }

    let adjusted = false;
    const adjust = (issue: ImportIssue) => {
      issues.push(issue);
      adjusted = true;
    };
    for (const cell of row.bad) {
      const params: Record<string, string> =
        cell.code === 'TABLE_BAD_DATE'
          ? { value: cell.value, format: mapping.dateFormat }
          : { value: cell.value };
      adjust(
        makeIssue(cell.code, params, {
          location: locate(number, cell.column),
          original: cell.value,
        }),
      );
    }

    // Code and name, cut to their limits (§5.10).
    const limited = (
      value: string,
      limit: number,
      field: string,
      code: string,
      column: number | null,
    ) => {
      if (value.length <= limit) return value;
      adjust(
        makeIssue(
          'TEXT_TRUNCATED',
          { field, code, n: limit },
          { location: locate(number, column), original: value },
        ),
      );
      return sliceText(value, limit);
    };
    const code = limited(row.code, TEXT_LIMITS.code, 'code', row.code, columnOf('code'));
    if (seenCodes.has(code) && !reportedCodes.has(code)) {
      issues.push(
        makeIssue('DUPLICATE_CODE', { code }, { location: locate(number, columnOf('code')) }),
      );
      reportedCodes.add(code);
    }
    seenCodes.add(code);
    let name: string;
    if (row.name === null) {
      adjust(
        makeIssue('TABLE_MISSING_NAME', { code }, { location: locate(number, columnOf('name')) }),
      );
      name = code;
    } else {
      name = limited(row.name, TEXT_LIMITS.name, 'name', code, columnOf('name'));
    }

    // Calendar: every distinct name is a generated calendar; one folding to "standard" is
    // Standard; an elapsed duration uses "24 hours" (§5.7, D43).
    let calendarId = STANDARD_CALENDAR_ID;
    if (row.calendar !== null && foldForMatch(row.calendar) !== 'standard') {
      const calendar = calendarFromName(row.calendar, mapping.hoursPerDay);
      calendarId = calendar.id;
      if (!generatedNames.has(calendar.id)) {
        generatedNames.add(calendar.id);
        model.calendars.push(calendar);
        issues.push(
          makeIssue('CALENDAR_GENERATED_FROM_NAME', {
            name: row.calendar,
            start: startTime,
            n: mapping.hoursPerDay,
          }),
        );
      }
    }
    const durationLocation = locate(number, columnOf('duration'));
    if (row.duration?.estimated) {
      adjust(makeIssue('TABLE_ESTIMATED_DURATION', { code }, { location: durationLocation }));
    }
    const elapsed = row.duration?.elapsed === true;
    if (elapsed) {
      if (!elapsedUsed) {
        model.calendars.push(elapsedCalendar());
        issues.push(makeIssue('CALENDAR_GENERATED_ELAPSED'));
      }
      elapsedUsed = true;
      adjust(makeIssue('ELAPSED_DURATION', { code }, { location: durationLocation }));
      calendarId = ELAPSED_CALENDAR_ID;
    }

    if (row.unknownType !== null) {
      adjust(
        makeIssue(
          'TABLE_UNKNOWN_TYPE',
          { value: row.unknownType },
          {
            location: locate(number, columnOf('activityType')),
            original: row.unknownType,
            used: 'Task',
          },
        ),
      );
    }

    let constraint: ImportActivity['constraint'] = null;
    if (row.unsupportedConstraint !== null) {
      adjust(
        makeIssue(
          'CONSTRAINT_UNSUPPORTED',
          { code, value: row.unsupportedConstraint },
          {
            location: locate(number, columnOf('constraintType')),
            original: row.unsupportedConstraint,
          },
        ),
      );
    } else if (row.constraint !== null) {
      const time = FINISH_CONSTRAINTS.has(row.constraint)
        ? assumptions.dateOnlyFinish
        : assumptions.dateOnlyStart;
      constraint = {
        type: row.constraint,
        date:
          row.constraint === 'as_late_as_possible' ? null : wallClockOf(row.constraintDate, time),
      };
    }

    const notes =
      row.notes === null
        ? null
        : limited(row.notes, TEXT_LIMITS.notes, 'notes', code, columnOf('notes'));
    const wbsId = row.wbs === null ? null : wbsIdOf(row.wbs, locate(number, columnOf('wbs')));

    const actual = {
      start: wallClockOf(row.actualStart, assumptions.dateOnlyStart),
      finish: wallClockOf(row.actualFinish, assumptions.dateOnlyFinish),
    };
    // Status as MSPDI's rule (§5.6): actual dates, then % complete.
    let status: ImportActivity['status'] = 'not_started';
    if (actual.finish !== null) status = 'completed';
    else if (actual.start !== null) status = 'in_progress';
    else if (row.percent !== null && row.percent >= 100) status = 'completed';
    else if (row.percent !== null && row.percent > 0) status = 'in_progress';

    const activity: ImportActivity = {
      keys: { taskId: row.taskId, uid: null, guid: null },
      code,
      name,
      wbsId,
      calendarId,
      type: row.type,
      originalDuration: row.duration?.minutes ?? null,
      remainingDuration: null,
      planned: {
        start: wallClockOf(row.start, assumptions.dateOnlyStart),
        finish: wallClockOf(row.finish, assumptions.dateOnlyFinish),
      },
      early: { start: null, finish: null },
      late: { start: null, finish: null },
      actual,
      remaining: { start: null, finish: null },
      constraint,
      secondaryConstraint: null,
      status,
      percent: {
        duration: row.percent,
        physical: null,
        type: row.percent === null ? null : 'duration',
      },
      totalFloat: null,
      freeFloat: null,
      notes,
      flags: { manual: false, elapsed, resourceDependent: false },
    };
    model.activities.push(activity);
    accepted.push({ row, activity, location: locate(number, columnOf('predecessors')) });
    acceptedCells.push(cells);
    activityCount.accepted += 1;
    if (adjusted) activityCount.adjusted += 1;
  }

  // ---- Relationships, from each accepted row's Predecessors cell -----------------------------
  const byCode = new Map<string, number>();
  const byTaskId = new Map<string, number>();
  accepted.forEach(({ row, activity }, index) => {
    for (const code of [activity.code, row.code]) if (!byCode.has(code)) byCode.set(code, index);
    if (row.taskId !== null && !byTaskId.has(row.taskId)) byTaskId.set(row.taskId, index);
  });
  const targets = mapping.predecessorRef === 'taskId' ? byTaskId : byCode;
  // A token that reads in more than one way ("A-1", "ACCESS") takes the ref the table names.
  const named = (ref: string) => targets.has(ref);
  const linkKeys = new Set<string>();
  accepted.forEach(({ row, activity, location }, successorIndex) => {
    const skip = (issue: ImportIssue) => {
      issues.push(issue);
      relationshipCount.skipped += 1;
    };
    for (const readings of row.predecessors) {
      const token = chooseReading(readings, named);
      relationshipCount.read += 1;
      if ('invalid' in token) {
        skip(
          makeIssue(
            'TABLE_BAD_LINK',
            { token: token.invalid },
            { location, original: token.invalid },
          ),
        );
        continue;
      }
      const predecessorIndex = targets.get(token.ref);
      const predecessor =
        predecessorIndex === undefined ? undefined : accepted[predecessorIndex]?.activity;
      const names = { predecessor: predecessor?.code ?? token.ref, successor: activity.code };
      if (predecessor === undefined || predecessorIndex === undefined) {
        skip(makeIssue('LINK_UNKNOWN_ACTIVITY', names, { location, original: token.ref }));
        continue;
      }
      if (predecessorIndex === successorIndex) {
        skip(makeIssue('LINK_SELF', { code: activity.code }, { location }));
        continue;
      }
      // A repeated link keys on predecessor, successor and type (D58).
      const key = `${predecessorIndex}\u0000${successorIndex}\u0000${token.type}`;
      if (linkKeys.has(key)) {
        skip(makeIssue('LINK_DUPLICATE', names, { location }));
        continue;
      }
      linkKeys.add(key);
      let lagMinutes: number;
      let lagElapsed = false;
      let adjusted = false;
      if ('percent' in token.lag) {
        // A percentage of the predecessor's duration, as working time (§5.6, §5.7).
        lagMinutes = Math.round((token.lag.percent / 100) * (predecessor.originalDuration ?? 0));
        issues.push(
          makeIssue(
            'PERCENT_LAG',
            { ...names, value: hoursText(lagMinutes) },
            { location, original: `${token.lag.percent}%`, used: hoursText(lagMinutes) },
          ),
        );
        adjusted = true;
      } else {
        lagMinutes = token.lag.minutes;
        lagElapsed = token.lag.elapsed;
        if (lagElapsed) issues.push(makeIssue('ELAPSED_LAG', names, { location }));
      }
      const relationship: ImportRelationship = {
        predecessorCode: predecessor.code,
        successorCode: activity.code,
        type: token.type,
        lagMinutes: noNegativeZero(lagMinutes),
        lagElapsed,
      };
      model.relationships.push(relationship);
      relationshipCount.accepted += 1;
      if (adjusted) relationshipCount.adjusted += 1;
    }
  });

  return {
    model,
    issues,
    // Generated calendars stay out of the count: a table defines none (D43).
    counts: [emptyCount('calendar'), wbsCount, activityCount, relationshipCount],
    formatVersion: null,
    sourceProject: {
      id: null,
      code: null,
      name: null,
      projectsInFile: 1,
      rootWbsName: null,
      mustFinishBy: null,
      stated: { start: null, finish: null },
    },
    units: {
      minutesPerDay: mapping.hoursPerDay * 60,
      calendars: model.calendars.map((c) => ({ name: c.name, hoursPerDay: c.hoursPerDay })),
    },
    externalLinks: [],
    notImported: [],
    elements: elementsOf(mapping, headers, acceptedCells, source),
    statusDate: { date: null, time: null, source: 'none' },
  };
}

/**
 * The source elements present, named as in OUTCOME_CATALOG: each mapped column with the accepted
 * rows that fill it, then the other columns that have a header or data.
 */
function elementsOf(
  mapping: TableMapping,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<TableCell | null>>,
  source: TableSource,
): ReadResult['elements'] {
  const elements: ReadResult['elements'] = [];
  const mapped = new Set<number>();
  for (const [field, element] of FIELD_ELEMENTS) {
    const column = mapping.columns[field]?.index;
    if (column === undefined) continue;
    mapped.add(column);
    const items = rows.filter((cells) => !isEmptyCell(cells[column])).length;
    if (items > 0) elements.push({ element, items });
  }
  const filled = new Set<number>();
  for (const { cells } of dataRows(source, mapping.headerRow)) {
    cells.forEach((cell, column) => {
      if (!isEmptyCell(cell)) filled.add(column);
    });
  }
  const unmapped = headers.filter(
    (header, column) => !mapped.has(column) && (header !== '' || filled.has(column)),
  ).length;
  if (unmapped > 0) elements.push({ element: 'Unmapped columns', items: unmapped });
  return elements;
}

/** The first 10 data rows as the preview shows them, invalid cells marked by the same reading. */
export function previewTable(source: TableSource, mapping: TableMapping): TablePreview {
  const headers = headersOf(source, mapping.headerRow);
  const rows = dataRows(source, mapping.headerRow)
    .slice(0, PREVIEW_ROWS)
    .map(({ number, cells }) => {
      const { invalid } = parseRow(cells, mapping, source.date1904);
      return {
        rowNumber: number,
        cells: headers.map((_, column) => ({
          text: cellText(cells[column], source.date1904),
          invalid: invalid.has(column),
        })),
      };
    });
  return { headers, rows };
}
