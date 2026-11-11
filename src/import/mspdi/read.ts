import type { ImportCount, ImportIssue } from '@/data/types';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { ELAPSED_CALENDAR_ID, elapsedCalendar, workingDay } from '../calendars';
import { makeIssue, sliceText, type IssueCode } from '../issues';
import {
  emptyModel,
  type ImportActivity,
  type ImportCalendar,
  type ImportConstraintType,
  type ImportRelationship,
  type WallClock,
} from '../model';
import type { ReadResult } from '../read-result';
import { calendarLocation, mspdiCalendarBase, readMspdiCalendars } from './calendars';
import {
  childOf,
  decodedText,
  decodedValue,
  isXmlNode,
  listOf,
  readBoolean,
  readDate,
  readNumber,
  valueText,
  type DecodedText,
  type XmlNode,
} from './xml-text';

// A Microsoft Project XML file as an ImportModel (P3 core spec §5.6, decisions D51, D52, D57, D58).

const ARRAY_ELEMENTS: ReadonlySet<string> = new Set([
  'Task',
  'PredecessorLink',
  'Calendar',
  'WeekDay',
  'WorkingTime',
  'Exception',
  'ExtendedAttribute',
]);
const MAX_NESTING = 100;
const TEXT_LIMITS = { code: 40, name: 255, notes: 4000 } as const;
const DEFAULT_MINUTES_PER_DAY = 480;
const MAX_BASE_LEVELS = 5;
// Duration and lag formats (Microsoft's codes): the elapsed ones, and the percentages, whose lag is
// in tenths of a percent; 20 and 52 are elapsed percentages (D58).
const ELAPSED_FORMATS: ReadonlySet<number> = new Set([4, 6, 8, 10, 12, 20, 36, 38, 40, 42, 44, 52]);
const PERCENT_FORMATS: ReadonlySet<number> = new Set([19, 20, 51, 52]);
const LINK_TYPES: ReadonlyMap<number, ImportRelationship['type']> = new Map([
  [0, 'FF'],
  [1, 'FS'],
  [2, 'SF'],
  [3, 'SS'],
]);
const CONSTRAINTS: ReadonlyMap<number, ImportConstraintType | null> = new Map([
  [0, null],
  [1, 'as_late_as_possible'],
  [2, 'mandatory_start'],
  [3, 'mandatory_finish'],
  [4, 'start_on_or_after'],
  [5, 'start_on_or_before'],
  [6, 'finish_on_or_after'],
  [7, 'finish_on_or_before'],
]);
// The FieldID of each task field Text1–Text30 (Microsoft's PjField constants).
const TEXT_FIELD_IDS: readonly string[] = [
  188743731, 188743734, 188743737, 188743740, 188743743, 188743746, 188743747, 188743748, 188743749,
  188743750, 188743997, 188743998, 188743999, 188744000, 188744001, 188744002, 188744003, 188744004,
  188744005, 188744006, 188744007, 188744008, 188744009, 188744010, 188744011, 188744012, 188744013,
  188744014, 188744015, 188744016,
].map(String);
const SETTINGS = [
  'ScheduleFromStart',
  'CalendarUID',
  'MinutesPerDay',
  'MinutesPerWeek',
  'DaysPerMonth',
  'DefaultStartTime',
  'DefaultFinishTime',
] as const;
// The issues that say an item was changed: it counts as adjusted (once).
const ADJUSTING_ACTIVITY: ReadonlySet<string> = new Set<IssueCode>([
  'MSPDI_MANUAL_TASK',
  'MSPDI_MANUAL_START_DROPPED',
  'MSPDI_MILESTONE_WITH_DURATION',
  'MSPDI_MILESTONE_AMBIGUOUS',
  'MSPDI_ZERO_DURATION',
  'ELAPSED_DURATION',
  'CODE_FALLBACK',
  'TEXT_TRUNCATED',
  'XML_BAD_CHARACTER',
  'CALENDAR_MISSING',
  'CONSTRAINT_UNSUPPORTED',
]);
const ADJUSTING_RELATIONSHIP: ReadonlySet<string> = new Set<IssueCode>([
  'LINK_TYPE_UNKNOWN',
  'PERCENT_LAG',
]);
const ADJUSTING_CALENDAR: ReadonlySet<string> = new Set<IssueCode>([
  'MSPDI_WORK_WEEKS',
  'CALENDAR_RECURRENCE_CAPPED',
  'CALENDAR_DATA_REPAIRED',
  'XML_BAD_CHARACTER',
]);
const ADJUSTING_WBS: ReadonlySet<string> = new Set<IssueCode>([
  'TEXT_TRUNCATED',
  'XML_BAD_CHARACTER',
]);
// When the file has no date at all, recurrences expand over Microsoft Project's own date range.
const NO_DATES_SPAN = { start: '1984-01-01', finish: '2129-12-31' };

// ---------------------------------------------------------------------------------------------
// Parsing

/**
 * The root `Project` element; null when the text isn't well-formed XML, nests deeper than 100
 * levels, has a DOCTYPE (§5.11) or has another root.
 */
function parseProject(text: string): XmlNode | null {
  const xml = text.startsWith('﻿') ? text.slice(1) : text;
  const firstElement = xml.search(/<[A-Za-z_]/);
  if (/<!DOCTYPE/i.test(firstElement < 0 ? xml : xml.slice(0, firstElement))) return null;
  try {
    if (XMLValidator.validate(xml) !== true) return null;
    const parsed: unknown = new XMLParser({
      parseTagValue: false,
      processEntities: false,
      removeNSPrefix: true,
      ignoreAttributes: true,
      maxNestedTags: MAX_NESTING,
      isArray: (name: string) => ARRAY_ELEMENTS.has(name),
    }).parse(xml);
    const project = childOf(parsed, 'Project');
    return isXmlNode(project) ? project : null;
  } catch {
    return null;
  }
}

/**
 * Plain decoded text of a name or an identifier, without reporting bad characters; null when
 * absent or empty. `NA` stays as written here; values that aren't text use valueText (D52).
 */
function plainText(node: unknown, key: string): string | null {
  return decodedText(node, key)?.text ?? null;
}

const DURATION = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/;

/** A duration `PTnHnMnS` as minutes; null when absent, `NA` or unreadable. */
function readDuration(node: unknown, key: string): number | null {
  const text = plainText(node, key);
  const match = text === null || text === 'PT' ? null : DURATION.exec(text);
  if (!match) return null;
  const [hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  const total = (hours ?? 0) * 60 + (minutes ?? 0) + (seconds ?? 0) / 60;
  return Math.round(total * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------------------------
// Tasks

interface TaskSource {
  node: unknown;
  index: number;
  uid: string;
  uidBadCharacters: readonly string[]; // reported for the WBS elements and activities kept
  location: string;
  name: string; // decoded, without reporting bad characters
  role: 'null' | 'root' | 'summary' | 'activity';
  skipped: 'MSPDI_INACTIVE_TASK' | 'MSPDI_EXTERNAL_TASK' | null;
  level: number;
}

function outlineLevel(node: unknown): number {
  const level = readNumber(node, 'OutlineLevel');
  if (level !== null && Number.isInteger(level) && level >= 0) return level;
  const outline = plainText(node, 'OutlineNumber');
  return outline === null ? 1 : outline.split('.').length;
}

/** Every Task element in file order, with what it is: a null row, the project summary, a WBS
 * element or an activity, and whether it is skipped as inactive or external. */
function taskSources(project: XmlNode): TaskSource[] {
  return listOf(childOf(childOf(project, 'Tasks'), 'Task')).map((node, index) => {
    const uidText = decodedText(node, 'UID');
    const uid = uidText?.text ?? '';
    const level = outlineLevel(node);
    const summary = readBoolean(node, 'Summary') === true;
    let role: TaskSource['role'] = summary ? 'summary' : 'activity';
    if (readBoolean(node, 'IsNull') === true) role = 'null';
    else if (level === 0 || (uid === '0' && summary)) role = 'root';
    let skipped: TaskSource['skipped'] = null;
    if (readBoolean(node, 'Active') === false) skipped = 'MSPDI_INACTIVE_TASK';
    else if (
      readBoolean(node, 'ExternalTask') === true ||
      readBoolean(node, 'IsSubproject') === true
    )
      skipped = 'MSPDI_EXTERNAL_TASK';
    return {
      node,
      index,
      uid,
      uidBadCharacters: uidText?.badCharacters ?? [],
      location: `Task UID ${uid}`,
      name: plainText(node, 'Name') ?? '',
      role,
      skipped,
      level,
    };
  });
}

/** The task's extended attribute values by FieldID, decoded. */
function extendedValues(node: unknown): Map<string, DecodedText> {
  const values = new Map<string, DecodedText>();
  for (const attribute of listOf(childOf(node, 'ExtendedAttribute'))) {
    const fieldId = plainText(attribute, 'FieldID');
    const value = decodedText(attribute, 'Value');
    if (fieldId !== null && value !== null && !values.has(fieldId)) values.set(fieldId, value);
  }
  return values;
}

/**
 * The value of a code field ('ID' or 'Text1'…'Text30') on each task, with the bad references it
 * held; null when empty (an `NA` ID too, D52).
 */
function codeFieldValues(sources: readonly TaskSource[], field: string): Array<DecodedText | null> {
  if (field === 'ID') return sources.map((source) => decodedValue(source.node, 'ID'));
  const number = /^Text([1-9]|[12]\d|30)$/.exec(field)?.[1];
  const fieldId = number === undefined ? undefined : TEXT_FIELD_IDS[Number(number) - 1];
  if (fieldId === undefined) return sources.map(() => null);
  return sources.map((source) => extendedValues(source.node).get(fieldId) ?? null);
}

/** For each value, whether it is filled and used by no other task. */
function usableValues(values: ReadonlyArray<string | null>): boolean[] {
  const uses = new Map<string, number>();
  for (const value of values) if (value !== null) uses.set(value, (uses.get(value) ?? 0) + 1);
  return values.map((value) => value !== null && uses.get(value) === 1);
}

function accepted(source: TaskSource): boolean {
  return source.role === 'activity' && source.skipped === null;
}

/**
 * The activity-code fields the Review step offers: 'UID', 'ID', then each Text1–Text30 field
 * filled and unique on at least 90 % of the activities, in number order.
 */
export function mspdiCodeFields(text: string): string[] {
  const fields = ['UID', 'ID'];
  const project = parseProject(text);
  if (!project) return fields;
  const activities = taskSources(project).filter(accepted);
  if (activities.length === 0) return fields;
  const values = activities.map((source) => extendedValues(source.node));
  TEXT_FIELD_IDS.forEach((fieldId, index) => {
    const usable = usableValues(values.map((byField) => byField.get(fieldId)?.text ?? null));
    const count = usable.filter(Boolean).length;
    if (count * 10 >= activities.length * 9) fields.push(`Text${index + 1}`);
  });
  return fields;
}

// ---------------------------------------------------------------------------------------------
// The reader

function emptyCounts(): ImportCount[] {
  return (['calendar', 'wbs', 'activity', 'relationship'] as const).map((entity) => ({
    entity,
    read: 0,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  }));
}

function unreadableResult(): ReadResult {
  return {
    model: emptyModel('mspdi'),
    issues: [makeIssue('FILE_UNREADABLE')],
    counts: emptyCounts(),
    formatVersion: null,
    sourceProject: {
      id: null,
      code: null,
      name: null,
      projectsInFile: 0,
      rootWbsName: null,
      mustFinishBy: null,
      stated: { start: null, finish: null },
    },
    units: { minutesPerDay: null, calendars: [] },
    externalLinks: [],
    notImported: [],
    elements: [],
    statusDate: { date: null, time: null, source: 'none' },
  };
}

function datePart(value: WallClock | null): string | null {
  return value === null ? null : value.slice(0, 10);
}

function shown(value: WallClock): string {
  return value.replace('T', ' ');
}

function hoursText(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${(hours === 0 ? 0 : hours).toLocaleString('en-US')} h`;
}

function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/** Reads a Microsoft Project XML file, its activities coded by `activityCodeField`. */
export function readMspdi(text: string, options: { activityCodeField: string }): ReadResult {
  const project = parseProject(text);
  if (!project) return unreadableResult();

  const model = emptyModel('mspdi');
  let datesDropped = false;
  const dateOf = (node: unknown, key: string): WallClock | null => {
    const date = readDate(node, key);
    datesDropped ||= date.dropped;
    return date.value;
  };
  const issues: ImportIssue[] = [];
  const reportedWithoutLocation = new Set<string>();
  /**
   * XML_BAD_CHARACTER for each bad reference of a value the import keeps. Values of the project
   * (its name, settings and format version) and external link targets have no location: each
   * reference is reported once among them.
   */
  const reportBad = (badCharacters: readonly string[], location: string | null) => {
    for (const value of new Set(badCharacters)) {
      if (location === null) {
        if (reportedWithoutLocation.has(value)) continue;
        reportedWithoutLocation.add(value);
      }
      issues.push(makeIssue('XML_BAD_CHARACTER', { value }, { location, original: value }));
    }
  };
  /** Decoded text with XML_BAD_CHARACTER for each bad reference. */
  const textOf = (node: unknown, key: string, location: string | null): string | null => {
    const decoded = decodedText(node, key);
    if (decoded === null) return null;
    reportBad(decoded.badCharacters, location);
    return decoded.text;
  };
  /** A field cut to its limit (§5.10), never inside a surrogate pair, with TEXT_TRUNCATED. */
  const limited = (value: string, limit: number, field: string, code: string, location: string) => {
    if (value.length <= limit) return value;
    issues.push(
      makeIssue('TEXT_TRUNCATED', { field, code, n: limit }, { location, original: value }),
    );
    return sliceText(value, limit);
  };

  const minutesPerDayValue = readNumber(project, 'MinutesPerDay');
  const minutesPerDay =
    minutesPerDayValue !== null && minutesPerDayValue > 0
      ? minutesPerDayValue
      : DEFAULT_MINUTES_PER_DAY;
  const sources = taskSources(project);
  // A task without a UID can't be named by a link: a link without a PredecessorUID is
  // LINK_UNKNOWN_ACTIVITY.
  const byUid = new Map<string, TaskSource>();
  for (const source of sources) {
    if (source.uid !== '' && !byUid.has(source.uid)) byUid.set(source.uid, source);
  }

  // ---- Calendars ------------------------------------------------------------------------------
  // Recurrences expand from the schedule's start to 20 years after its finish: the project's dates
  // and every task date widen the span.
  const spanDates: string[] = [];
  for (const date of [dateOf(project, 'StartDate'), dateOf(project, 'FinishDate')]) {
    if (date !== null) spanDates.push(date.slice(0, 10));
  }
  for (const source of sources) {
    if (source.role === 'null') continue;
    for (const key of ['Start', 'Finish', 'ActualStart', 'ActualFinish']) {
      const date = dateOf(source.node, key);
      if (date !== null) spanDates.push(date.slice(0, 10));
    }
  }
  spanDates.sort();
  const span =
    spanDates.length === 0
      ? NO_DATES_SPAN
      : { start: spanDates[0]!, finish: spanDates[spanDates.length - 1]! };
  const calendarNodes = listOf(childOf(childOf(project, 'Calendars'), 'Calendar'));
  const calendarRead = readMspdiCalendars(calendarNodes, span);
  const fileCalendarIds: string[] = [];
  const calendarNames = new Map<string, string>();
  const baseOf = new Map<string, string | null>();
  for (const node of calendarNodes) {
    const id = plainText(node, 'UID');
    if (id === null || baseOf.has(id)) continue;
    fileCalendarIds.push(id);
    calendarNames.set(id, plainText(node, 'Name') ?? id);
    baseOf.set(id, mspdiCalendarBase(node));
  }
  // The project calendar is Project/CalendarUID, else the first calendar (D58).
  const projectCalendarUid = valueText(project, 'CalendarUID');
  const defaultCalendarId =
    projectCalendarUid !== null && baseOf.has(projectCalendarUid)
      ? projectCalendarUid
      : (fileCalendarIds[0] ?? null);
  const used = new Set<string>();
  const addUsed = (id: string | null) => {
    for (let k = 0, current = id; current !== null && k <= MAX_BASE_LEVELS; k += 1) {
      if (used.has(current) || !baseOf.has(current)) return;
      used.add(current);
      current = baseOf.get(current) ?? null;
    }
  };
  addUsed(defaultCalendarId);

  // ---- WBS and activities, in file order -------------------------------------------------------
  const wbsCount: ImportCount = { entity: 'wbs', read: 0, accepted: 0, adjusted: 0, skipped: 0 };
  const activityCount: ImportCount = {
    entity: 'activity',
    read: 0,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  };
  const field = options.activityCodeField;
  const activitySources = sources.filter(accepted);
  const fieldValues = field === 'UID' ? [] : codeFieldValues(activitySources, field);
  const fieldUsable = usableValues(fieldValues.map((value) => value?.text ?? null));
  const positionOf = new Map(activitySources.map((source, position) => [source, position]));
  const codeBySource = new Map<TaskSource, string>();
  const durationBySource = new Map<TaskSource, number | null>();
  const seenCodes = new Set<string>();
  const reportedCodes = new Set<string>();
  const stack: Array<{ level: number; id: string }> = [];
  const siblings = new Map<string | null, number>();
  let elapsedUsed = false;
  let noCalendarReported = false;

  for (const source of sources) {
    if (source.role === 'null' || source.role === 'root') continue;
    const { node, uid, location, level } = source;
    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    const parentId = stack[stack.length - 1]?.id ?? null;
    const counter = source.role === 'summary' ? wbsCount : activityCount;
    counter.read += 1;
    if (source.skipped !== null) {
      issues.push(makeIssue(source.skipped, { name: source.name }, { location }));
      counter.skipped += 1;
      continue;
    }
    const before = issues.length;
    const adjusted = (codes: ReadonlySet<string>) =>
      issues.slice(before).some((issue) => codes.has(issue.code));
    // The UID is kept (the id, or the code by default); its bad characters are reported.
    reportBad(source.uidBadCharacters, location);

    if (source.role === 'summary') {
      // Values on summary rows aren't read (§5.6). The code is the outline number's last segment.
      const outline = decodedText(node, 'OutlineNumber');
      if (outline !== null) reportBad(outline.badCharacters, location);
      const code = outline === null ? uid : (outline.text.split('.').pop() ?? outline.text);
      const name = limited(
        textOf(node, 'Name', location) ?? '',
        TEXT_LIMITS.name,
        'name',
        code,
        location,
      );
      const order = siblings.get(parentId) ?? 0;
      siblings.set(parentId, order + 1);
      model.wbs.push({ id: uid, parentId, code, name, order });
      stack.push({ level, id: uid });
      wbsCount.accepted += 1;
      if (adjusted(ADJUSTING_WBS)) wbsCount.adjusted += 1;
      continue;
    }

    // Code: the chosen field's value, its bad characters reported; an empty or shared one uses the
    // UID (CODE_FALLBACK).
    let name = textOf(node, 'Name', location) ?? '';
    let code = uid;
    if (field !== 'UID') {
      const position = positionOf.get(source) ?? -1;
      const value = fieldValues[position] ?? null;
      if (value !== null && fieldUsable[position]) {
        code = value.text;
        reportBad(value.badCharacters, location);
      } else {
        issues.push(makeIssue('CODE_FALLBACK', { name, field, uid }, { location, used: uid }));
      }
    }
    code = limited(code, TEXT_LIMITS.code, 'code', code, location);
    name = limited(name, TEXT_LIMITS.name, 'name', code, location);
    if (seenCodes.has(code) && !reportedCodes.has(code)) {
      issues.push(makeIssue('DUPLICATE_CODE', { code }, { location }));
      reportedCodes.add(code);
    }
    seenCodes.add(code);
    codeBySource.set(source, code);

    // Calendar: an elapsed duration uses the generated 24-hour calendar (§5.6).
    const durationFormat = readNumber(node, 'DurationFormat');
    const elapsed = durationFormat !== null && ELAPSED_FORMATS.has(durationFormat);
    let calendarId: string;
    if (elapsed) {
      if (!elapsedUsed) issues.push(makeIssue('CALENDAR_GENERATED_ELAPSED'));
      elapsedUsed = true;
      issues.push(makeIssue('ELAPSED_DURATION', { code }, { location }));
      calendarId = ELAPSED_CALENDAR_ID;
    } else {
      const own = valueText(node, 'CalendarUID');
      if (own !== null && own !== '-1' && baseOf.has(own)) calendarId = own;
      else if (defaultCalendarId !== null) {
        if (own !== null && own !== '-1') {
          issues.push(
            makeIssue(
              'CALENDAR_MISSING',
              { code },
              { location, original: own, used: defaultCalendarId },
            ),
          );
        }
        calendarId = defaultCalendarId;
      } else {
        // Nothing the activities could be scheduled on.
        if (!noCalendarReported) issues.push(makeIssue('FILE_UNREADABLE', {}, { location }));
        noCalendarReported = true;
        calendarId = own ?? '';
      }
      addUsed(calendarId);
    }

    const duration = readDuration(node, 'Duration');
    durationBySource.set(source, duration);
    const start = dateOf(node, 'Start');
    const finish = dateOf(node, 'Finish');
    const actual = { start: dateOf(node, 'ActualStart'), finish: dateOf(node, 'ActualFinish') };

    // Constraint, then a manual task's start (§5.6).
    let constraint: ImportActivity['constraint'] = null;
    const constraintRaw = valueText(node, 'ConstraintType');
    if (constraintRaw !== null) {
      const constraintNumber = readNumber(node, 'ConstraintType');
      const constraintType =
        constraintNumber === null ? undefined : CONSTRAINTS.get(constraintNumber);
      if (constraintType === undefined) {
        issues.push(
          makeIssue(
            'CONSTRAINT_UNSUPPORTED',
            { code, value: constraintRaw },
            { location, original: constraintRaw },
          ),
        );
      } else if (constraintType !== null) {
        constraint = {
          type: constraintType,
          date: constraintType === 'as_late_as_possible' ? null : dateOf(node, 'ConstraintDate'),
        };
      }
    }
    const manual = readBoolean(node, 'Manual') === true;
    if (manual) {
      const manualStart = dateOf(node, 'ManualStart') ?? start;
      if (manualStart !== null && constraint === null) {
        constraint = { type: 'start_on_or_after', date: manualStart };
        issues.push(
          makeIssue('MSPDI_MANUAL_TASK', { code, date: shown(manualStart) }, { location }),
        );
      } else if (manualStart !== null) {
        issues.push(
          makeIssue(
            'MSPDI_MANUAL_START_DROPPED',
            { code, date: shown(manualStart) },
            { location, original: shown(manualStart) },
          ),
        );
      }
    }

    // Milestones (D48): a zero duration sits on its calendar's first or last working minute.
    const flagged = readBoolean(node, 'Milestone') === true;
    let type: ImportActivity['type'] = 'task';
    if (duration === 0 || (duration === null && flagged)) {
      type = 'start_milestone';
      const at = start ?? finish;
      const calendar =
        calendarId === ELAPSED_CALENDAR_ID
          ? elapsedCalendar()
          : calendarRead.calendars.get(calendarId);
      if (at !== null && calendar) {
        const periods = workingDay(calendar, at.slice(0, 10));
        const minute = Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
        if (
          periods.length > 0 &&
          minute === periods[periods.length - 1]!.finish &&
          minute !== periods[0]!.start
        ) {
          type = 'finish_milestone';
        } else if (periods.length === 0 || minute !== periods[0]!.start) {
          issues.push(
            makeIssue('MSPDI_MILESTONE_AMBIGUOUS', { code, time: at.slice(11, 16) }, { location }),
          );
        }
      }
      if (!flagged) issues.push(makeIssue('MSPDI_ZERO_DURATION', { code }, { location }));
    } else if (flagged) {
      issues.push(makeIssue('MSPDI_MILESTONE_WITH_DURATION', { code }, { location }));
    }

    // Status (§5.6): actual dates, then % complete.
    const percent = readNumber(node, 'PercentComplete');
    let status: ImportActivity['status'] = 'not_started';
    if (actual.finish !== null) status = 'completed';
    else if (actual.start !== null) status = 'in_progress';
    else if (percent !== null && percent >= 100) status = 'completed';
    else if (percent !== null && percent > 0) status = 'in_progress';

    const notesText = textOf(node, 'Notes', location);
    const notes =
      notesText === null ? null : limited(notesText, TEXT_LIMITS.notes, 'notes', code, location);
    const slack = (key: string) => {
      const tenths = readNumber(node, key);
      return tenths === null ? null : noNegativeZero(tenths / 10); // tenths of a minute
    };
    const early = {
      start: dateOf(node, 'EarlyStart') ?? start,
      finish: dateOf(node, 'EarlyFinish') ?? finish,
    };
    const late = {
      start: dateOf(node, 'LateStart') ?? start,
      finish: dateOf(node, 'LateFinish') ?? finish,
    };
    const resume = dateOf(node, 'Resume');

    model.activities.push({
      keys: { taskId: null, uid, guid: textOf(node, 'GUID', location) },
      code,
      name,
      wbsId: parentId,
      calendarId,
      type,
      originalDuration: duration,
      remainingDuration: readDuration(node, 'RemainingDuration'),
      planned: { start, finish },
      early,
      late,
      actual,
      // The remaining work runs from Resume to the finish; Stop isn't kept (D60).
      remaining: resume ? { start: resume, finish } : { start: null, finish: null },
      constraint,
      secondaryConstraint: null,
      status,
      percent: {
        duration: percent,
        physical: readNumber(node, 'PhysicalPercentComplete'),
        type: null,
      },
      totalFloat: slack('TotalSlack'),
      freeFloat: slack('FreeSlack'),
      notes,
      flags: { manual, elapsed, resourceDependent: false },
    });
    activityCount.accepted += 1;
    if (adjusted(ADJUSTING_ACTIVITY)) activityCount.adjusted += 1;
  }

  // ---- Relationships --------------------------------------------------------------------------
  const relationshipCount: ImportCount = {
    entity: 'relationship',
    read: 0,
    accepted: 0,
    adjusted: 0,
    skipped: 0,
  };
  const externalLinks = new Map<string, number>();
  const linkKeys = new Set<string>();
  /** The project an external task or inserted project comes from: ExternalTaskProject, else
   * its name. */
  const externalTarget = (node: unknown): DecodedText =>
    decodedText(node, 'ExternalTaskProject') ??
    decodedText(node, 'Name') ?? { text: '', badCharacters: [] };
  for (const source of sources) {
    // Links of null rows, the project summary and inactive tasks go with them.
    if (
      source.role === 'null' ||
      source.role === 'root' ||
      source.skipped === 'MSPDI_INACTIVE_TASK'
    ) {
      continue;
    }
    const { location } = source;
    const outside = source.skipped === 'MSPDI_EXTERNAL_TASK';
    const successorCode = codeBySource.get(source) ?? source.uid;
    const skip = (issue: ImportIssue) => {
      issues.push(issue);
      relationshipCount.skipped += 1;
    };
    /** A link outside the file, counted under its target; the target's bad references are
     * reported without a location. */
    const external = (target: DecodedText) => {
      reportBad(target.badCharacters, null);
      externalLinks.set(target.text, (externalLinks.get(target.text) ?? 0) + 1);
      skip(makeIssue('MSPDI_EXTERNAL_LINK', { target: target.text }, { location }));
    };
    for (const link of listOf(childOf(source.node, 'PredecessorLink'))) {
      const predecessorUidText = decodedText(link, 'PredecessorUID');
      const predecessorUid = predecessorUidText?.text ?? '';
      // A CrossProject link is external before its UID is looked up (D58).
      const crossProject = readBoolean(link, 'CrossProject') === true;
      const predecessor = crossProject ? undefined : byUid.get(predecessorUid);
      if (
        predecessor &&
        (predecessor.role === 'null' || predecessor.skipped === 'MSPDI_INACTIVE_TASK')
      ) {
        continue;
      }
      if (outside) {
        // A link stored on an external task or inserted project whose predecessor is kept from
        // this file points outside the file, unless that end is a summary (a summary end comes
        // first, as below). A link with no end kept from this file goes with the task.
        if (!predecessor || predecessor.skipped !== null) continue;
        relationshipCount.read += 1;
        if (predecessor.role === 'activity') external(externalTarget(source.node));
        else skip(makeIssue('MSPDI_SUMMARY_LINK', { name: predecessor.name }, { location }));
        continue;
      }
      relationshipCount.read += 1;
      if (source.role === 'summary') {
        skip(makeIssue('MSPDI_SUMMARY_LINK', { name: source.name }, { location }));
        continue;
      }
      if (crossProject) {
        external(
          decodedText(link, 'CrossProjectName') ??
            predecessorUidText ?? { text: '', badCharacters: [] },
        );
        continue;
      }
      const names = { predecessor: predecessorUid, successor: successorCode };
      if (!predecessor) {
        skip(makeIssue('LINK_UNKNOWN_ACTIVITY', names, { location }));
        continue;
      }
      if (predecessor.skipped === 'MSPDI_EXTERNAL_TASK') {
        external(externalTarget(predecessor.node));
        continue;
      }
      if (predecessor.role !== 'activity') {
        skip(makeIssue('MSPDI_SUMMARY_LINK', { name: predecessor.name }, { location }));
        continue;
      }
      names.predecessor = codeBySource.get(predecessor) ?? predecessorUid;
      if (predecessor === source) {
        skip(makeIssue('LINK_SELF', { code: successorCode }, { location }));
        continue;
      }
      const typeRaw = valueText(link, 'Type');
      const typeNumber = readNumber(link, 'Type');
      const known = typeNumber === null ? undefined : LINK_TYPES.get(typeNumber);
      const type = known ?? 'FS';
      // A repeated link keys on predecessor, successor and type (D58).
      const key = `${predecessor.uid}\u0000${source.uid}\u0000${type}`;
      if (linkKeys.has(key)) {
        skip(makeIssue('LINK_DUPLICATE', names, { location }));
        continue;
      }
      linkKeys.add(key);
      const before = issues.length;
      if (known === undefined && typeRaw !== null) {
        issues.push(
          makeIssue(
            'LINK_TYPE_UNKNOWN',
            { ...names, value: typeRaw },
            { location, original: typeRaw, used: 'FS' },
          ),
        );
      }
      // LinkLag is in tenths of a minute, or of a percent for percentage formats (D58).
      const linkLag = readNumber(link, 'LinkLag') ?? 0;
      const lagFormat = readNumber(link, 'LagFormat');
      let lagMinutes = linkLag / 10;
      const lagElapsed = lagFormat !== null && ELAPSED_FORMATS.has(lagFormat);
      if (lagFormat !== null && PERCENT_FORMATS.has(lagFormat)) {
        const base = durationBySource.get(predecessor) ?? 0;
        lagMinutes = Math.round((linkLag / 1000) * base);
        issues.push(
          makeIssue(
            'PERCENT_LAG',
            { ...names, value: hoursText(lagMinutes) },
            { location, original: `${linkLag / 10}%`, used: hoursText(lagMinutes) },
          ),
        );
      }
      if (lagElapsed) issues.push(makeIssue('ELAPSED_LAG', names, { location }));
      model.relationships.push({
        predecessorCode: names.predecessor,
        successorCode,
        type,
        lagMinutes: noNegativeZero(lagMinutes),
        lagElapsed,
      });
      relationshipCount.accepted += 1;
      if (issues.slice(before).some((issue) => ADJUSTING_RELATIONSHIP.has(issue.code))) {
        relationshipCount.adjusted += 1;
      }
    }
  }

  // ---- Calendars in the model -----------------------------------------------------------------
  const resourceCalendars = new Set<string>();
  for (const resource of listOf(childOf(childOf(project, 'Resources'), 'Resource'))) {
    const id = valueText(resource, 'CalendarUID');
    if (id !== null) resourceCalendars.add(id);
  }
  for (const id of fileCalendarIds) {
    const calendar = calendarRead.calendars.get(id);
    if (!calendar) continue;
    let kind: ImportCalendar['kind'] = 'global';
    if (id === defaultCalendarId) kind = 'project';
    else if (resourceCalendars.has(id) && !used.has(id)) kind = 'resource';
    model.calendars.push({ ...calendar, kind });
  }
  if (elapsedUsed) model.calendars.push(elapsedCalendar());

  // A calendar nothing uses that can't be read is skipped with a warning (§5.5).
  const idByLocation = new Map(fileCalendarIds.map((id) => [calendarLocation(id), id]));
  const adjustedLocations = new Set<string | null>();
  const calendarIssues = calendarRead.issues.map((issue) => {
    if (ADJUSTING_CALENDAR.has(issue.code)) adjustedLocations.add(issue.location);
    const id = issue.location === null ? undefined : idByLocation.get(issue.location);
    if (issue.severity !== 'error' || id === undefined || used.has(id)) return issue;
    if (!calendarRead.unreadable.has(id)) return issue;
    return makeIssue(
      'CALENDAR_UNUSED_SKIPPED',
      { name: calendarNames.get(id) ?? id },
      { location: issue.location },
    );
  });
  const calendarCount: ImportCount = {
    entity: 'calendar',
    read: calendarNodes.length,
    accepted: calendarRead.calendars.size,
    adjusted: [...calendarRead.calendars.keys()].filter((id) =>
      adjustedLocations.has(calendarLocation(id)),
    ).length,
    skipped: calendarNodes.length - calendarRead.calendars.size,
  };

  // ---- Project --------------------------------------------------------------------------------
  const statusClock = dateOf(project, 'StatusDate');
  const statedStart = dateOf(project, 'StartDate');
  const statedFinish = dateOf(project, 'FinishDate');
  // The project's name has no location of its own: its bad characters are reported without one.
  const projectName = textOf(project, 'Name', null) ?? textOf(project, 'Title', null);
  // The settings kept for P4 and the format version, their bad characters reported likewise.
  for (const key of SETTINGS) {
    const value = decodedValue(project, key);
    if (value === null) continue;
    reportBad(value.badCharacters, null);
    model.settings.push({ key, value: value.text });
  }
  const saveVersion = decodedValue(project, 'SaveVersion');
  if (saveVersion !== null) reportBad(saveVersion.badCharacters, null);
  // MSPDI_DATE_ZONE_DROPPED once per import (D52): the calendars report their own dates.
  const zoneReported = calendarIssues.some((issue) => issue.code === 'MSPDI_DATE_ZONE_DROPPED');
  const allIssues = calendarIssues;
  for (const issue of issues) allIssues.push(issue);
  if (datesDropped && !zoneReported) allIssues.push(makeIssue('MSPDI_DATE_ZONE_DROPPED'));
  model.project = {
    code: null,
    name: projectName,
    rootWbsName: null,
    statedStart,
    statedFinish,
    mustFinishBy: null,
    statusDate: statusClock,
    defaultCalendarId,
  };

  // The status date: the file's, else the earliest task start (the Review step says so, §5.6).
  let statusDate: ReadResult['statusDate'] = { date: null, time: null, source: 'none' };
  if (statusClock !== null) {
    statusDate = {
      date: statusClock.slice(0, 10),
      time: statusClock.slice(11, 16),
      source: 'file',
    };
  } else {
    const starts = model.activities
      .map((activity) => activity.planned.start)
      .filter((start): start is WallClock => start !== null)
      .sort();
    const earliest = starts[0];
    if (earliest !== undefined) {
      statusDate = {
        date: earliest.slice(0, 10),
        time: earliest.slice(11, 16),
        source: 'earliest-start',
      };
    }
  }

  return {
    model,
    issues: allIssues,
    counts: [calendarCount, wbsCount, activityCount, relationshipCount],
    formatVersion: saveVersion?.text ?? null,
    sourceProject: {
      id: null,
      code: null,
      name: projectName,
      projectsInFile: 1,
      rootWbsName: null,
      mustFinishBy: null,
      stated: { start: datePart(statedStart), finish: datePart(statedFinish) },
    },
    units: {
      minutesPerDay,
      calendars: model.calendars.map((c) => ({ name: c.name, hoursPerDay: c.hoursPerDay })),
    },
    externalLinks: [...externalLinks.entries()].map(([target, links]) => ({ target, links })),
    notImported: [],
    elements: elementsOf(project, sources, model, calendarRead.calendars.size),
    statusDate,
  };
}

// ---------------------------------------------------------------------------------------------
// Outcomes

function nonZero(node: unknown, key: string): boolean {
  const value = readNumber(node, key);
  return value !== null && value !== 0;
}

/** Whether the element holds a value; `NA` is none (D52). */
function has(node: unknown, key: string): boolean {
  return valueText(node, key) !== null;
}

/** The source elements present, named as in OUTCOME_CATALOG, with their item counts. */
function elementsOf(
  project: XmlNode,
  sources: readonly TaskSource[],
  model: ReadResult['model'],
  calendars: number,
): ReadResult['elements'] {
  const { activities } = model;
  const count = (test: (activity: ImportActivity) => boolean) => activities.filter(test).length;
  const tasks = sources.filter((source) => source.role === 'activity' || source.role === 'summary');
  const taskCount = (test: (node: unknown) => boolean) =>
    tasks.filter((source) => test(source.node)).length;
  const resources = listOf(childOf(childOf(project, 'Resources'), 'Resource')).filter(
    (resource) => plainText(resource, 'UID') !== '0' && readBoolean(resource, 'IsNull') !== true,
  );
  const assignments = listOf(childOf(childOf(project, 'Assignments'), 'Assignment'));
  const timephased =
    tasks.reduce<number>(
      (total, source) => total + listOf(childOf(source.node, 'TimephasedData')).length,
      0,
    ) +
    assignments.reduce<number>(
      (total, assignment) => total + listOf(childOf(assignment, 'TimephasedData')).length,
      0,
    );
  return [
    { element: 'Tasks', items: activities.length },
    { element: 'Links', items: model.relationships.length },
    { element: 'Calendars', items: calendars },
    {
      element: 'Durations',
      items: count((a) => a.originalDuration !== null || a.remainingDuration !== null),
    },
    {
      element: 'Actual dates',
      items: count((a) => a.actual.start !== null || a.actual.finish !== null),
    },
    { element: 'Constraints', items: count((a) => a.constraint !== null) },
    { element: 'Manual starts', items: count((a) => a.flags.manual) },
    { element: 'Summary tasks', items: model.wbs.length },
    {
      element: 'Early and late dates',
      items: taskCount((node) =>
        ['EarlyStart', 'EarlyFinish', 'LateStart', 'LateFinish'].some((key) => has(node, key)),
      ),
    },
    {
      element: 'Total and free slack',
      items: taskCount((node) => has(node, 'TotalSlack') || has(node, 'FreeSlack')),
    },
    { element: 'Task notes', items: count((a) => a.notes !== null) },
    { element: 'Scheduling settings', items: model.settings.length },
    { element: 'Deadlines', items: taskCount((node) => has(node, 'Deadline')) },
    { element: 'Resources', items: resources.length },
    { element: 'Assignments', items: assignments.length },
    {
      element: 'Baselines',
      items: taskCount((node) => listOf(childOf(node, 'Baseline')).length > 0),
    },
    {
      element: 'Costs',
      items: taskCount((node) =>
        ['Cost', 'FixedCost', 'ActualCost'].some((key) => nonZero(node, key)),
      ),
    },
    {
      element: 'Custom fields',
      items: tasks.reduce(
        (total, source) => total + listOf(childOf(source.node, 'ExtendedAttribute')).length,
        0,
      ),
    },
    {
      element: 'Outline codes',
      items: listOf(childOf(childOf(project, 'OutlineCodes'), 'OutlineCode')).length,
    },
    {
      element: 'Hyperlinks',
      items: taskCount((node) => has(node, 'Hyperlink') || has(node, 'HyperlinkAddress')),
    },
    {
      element: 'Recurring task definitions',
      items: taskCount((node) => readBoolean(node, 'Recurring') === true),
    },
    {
      element: 'Leveling and priority',
      items: taskCount(
        (node) =>
          nonZero(node, 'LevelingDelay') ||
          (has(node, 'Priority') && readNumber(node, 'Priority') !== 500),
      ),
    },
    { element: 'Timephased data', items: timephased },
    {
      element: 'Split segments',
      items: taskCount((node) => {
        const stop = readDate(node, 'Stop').value;
        const resume = readDate(node, 'Resume').value;
        return stop !== null && resume !== null && resume > stop;
      }),
    },
    {
      element: 'Earned value',
      items: taskCount((node) => ['BCWS', 'BCWP', 'ACWP'].some((key) => nonZero(node, key))),
    },
  ].filter((element) => element.items > 0);
}
