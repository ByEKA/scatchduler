import type { ImportIssue, ISODate } from '@/data/types';
import {
  civilOfDayNumber,
  dayNumberOf,
  dayNumberOfCivil,
  daysInMonth,
  isoDateOfDayNumber,
  weekdayOf,
  weekHoursPerDay,
} from '../calendars';
import { makeIssue, type IssueCode } from '../issues';
import type { ImportCalendar, Period } from '../model';
import {
  childOf,
  decodedText,
  listOf,
  readBoolean,
  readDate,
  readNumber,
  valueText,
  type DecodedText,
} from './xml-text';

// Microsoft Project XML calendars (P3 core spec §5.6, §5.5 "Calendar problems", D51, D57, D58):
// `WeekDays` (DayType 1–7 = Sunday–Saturday; DayType 0 legacy exceptions, read only when the
// calendar has no `Exceptions` element) and 2007+ `Exceptions`, whose recurrences expand from the
// schedule's start to 20 years after its finish, within their own dates or occurrences. A derived
// calendar inherits every weekday and exception it doesn't list, down the chain. A calendar that
// can't be read completely is left out and named in `unreadable` with one error; the reader turns
// that error into CALENDAR_UNUSED_SKIPPED when nothing uses the calendar. Calendars are keyed by
// their decoded UID, as task UIDs and every reference to a calendar are read.

const MAX_RECURRENCE_DATES = 10_000; // per calendar (§5.10)
const MAX_EXCEPTION_DATES = 100_000; // across all calendars, after inheritance (D57)
const MAX_STEPS_WITHOUT_DATE = 100_000; // a recurrence that adds no date stops here (D58)
const MAX_BASE_LEVELS = 5;
const WINDOW_YEARS = 20;
const NO_BASE = new Set(['-1', '0', '-65533']); // D51
const DAY_MINUTES = 1440;

export function calendarLocation(uid: string): string {
  return `Calendar UID ${uid}`;
}

/** The base calendar a calendar names; null for a base calendar or one without a base (D51). */
export function mspdiCalendarBase(calendar: unknown): string | null {
  if (readBoolean(calendar, 'IsBaseCalendar') === true) return null;
  const base = valueText(calendar, 'BaseCalendarUID'); // NA is no base (D52)
  return base === null || NO_BASE.has(base) ? null : base;
}

// ---- Times and periods ----

const TIME = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.0+)?)?$/;

/** Minutes from midnight; non-zero seconds are unreadable; 24:00 only as a finish. */
function readTime(text: string | null, role: 'start' | 'finish'): number | null {
  const match = text === null ? null : TIME.exec(text);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (match[3] !== undefined && Number(match[3]) !== 0) return null;
  if (hour === 24 && minute === 0) return role === 'finish' ? DAY_MINUTES : null;
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * The periods of a `WorkingTimes` list, sorted. A finish of 00:00 is midnight at the end of the
 * day, so 00:00 to 00:00 is the whole day (D58). A period that ends at or before its start in any
 * other way, or overlaps another, is unreadable (null).
 */
function readPeriods(workingTimes: unknown[]): Period[] | null {
  const periods: Period[] = [];
  for (const workingTime of workingTimes) {
    const start = readTime(valueText(workingTime, 'FromTime'), 'start');
    let finish = readTime(valueText(workingTime, 'ToTime'), 'finish');
    if (start === null || finish === null) return null;
    if (finish === 0) finish = DAY_MINUTES;
    if (finish <= start) return null;
    periods.push({ start, finish });
  }
  periods.sort((a, b) => a.start - b.start);
  for (let k = 1; k < periods.length; k += 1) {
    if (periods[k]!.start < periods[k - 1]!.finish) return null;
  }
  return periods;
}

/** A weekday's or an exception's periods: [] when non-working; null when unreadable. */
function dayPeriods(node: unknown): Period[] | null {
  const working = readBoolean(node, 'DayWorking');
  if (working === false) return [];
  const periods = readPeriods(listOf(childOf(childOf(node, 'WorkingTimes'), 'WorkingTime')));
  if (periods === null || (working === true && periods.length === 0)) return null;
  return periods;
}

// ---- Recurrences ----

interface Recurrence {
  type: number; // 1 daily, 2 yearly by month day, 3 yearly by position, 4 monthly by day, 5 monthly by position, 6 weekly
  from: number; // day numbers, inclusive
  to: number;
  period: number; // every n days, weeks or months
  occurrences: number | null; // when entered by occurrences
  daysOfWeek: number; // bit 1 = Sunday … 64 = Saturday
  month: number; // 1–12
  monthDay: number; // 1–31
  monthItem: number; // 0 day, 1 weekday, 2 weekend day, 3–9 Sunday–Saturday
  monthPosition: number; // 0–3 first–fourth, 4 last
}

function integerIn(value: number | null, min: number, max: number): number | null {
  return value !== null && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** The recurrence's own parameters; null when one it needs is missing or out of range. */
function recurrenceOf(record: unknown, type: number, from: number, to: number): Recurrence | null {
  const period = integerIn(readNumber(record, 'Period'), 1, Number.MAX_SAFE_INTEGER) ?? 1;
  const occurrences =
    readBoolean(record, 'EnteredByOccurrences') === true
      ? integerIn(readNumber(record, 'Occurrences'), 0, Number.MAX_SAFE_INTEGER)
      : null;
  const recurrence: Recurrence = {
    type,
    from,
    to,
    period,
    occurrences,
    daysOfWeek: (integerIn(readNumber(record, 'DaysOfWeek'), 0, 127) ?? 0) & 127,
    month: 1,
    monthDay: 1,
    monthItem: 0,
    monthPosition: 0,
  };
  if (type === 2 || type === 3) {
    const month = integerIn(readNumber(record, 'Month'), 0, 11);
    if (month === null) return null;
    recurrence.month = month + 1;
  }
  if (type === 2 || type === 4) {
    const monthDay = integerIn(readNumber(record, 'MonthDay'), 1, 31);
    if (monthDay === null) return null;
    recurrence.monthDay = monthDay;
  }
  if (type === 3 || type === 5) {
    const item = integerIn(readNumber(record, 'MonthItem'), 0, 9);
    const position = integerIn(readNumber(record, 'MonthPosition'), 0, 4);
    if (item === null || position === null) return null;
    recurrence.monthItem = item;
    recurrence.monthPosition = position;
  }
  return recurrence;
}

function matchesItem(item: number, weekday: number): boolean {
  if (item === 0) return true;
  if (item === 1) return weekday >= 1 && weekday <= 5;
  if (item === 2) return weekday === 0 || weekday === 6;
  return weekday === item - 3;
}

/** The day of a month at a position (first … fourth, or last) of an item; null when it has none. */
function dayAtPosition(year: number, month: number, item: number, position: number): number | null {
  const first = dayNumberOfCivil(year, month, 1);
  const last = first + daysInMonth(year, month) - 1;
  if (position === 4) {
    for (let day = last; day >= first; day -= 1) if (matchesItem(item, weekdayOf(day))) return day;
    return null;
  }
  let seen = 0;
  for (let day = first; day <= last; day += 1) {
    if (!matchesItem(item, weekdayOf(day))) continue;
    if (seen === position) return day;
    seen += 1;
  }
  return null;
}

/**
 * The recurrence's dates inside [windowStart, windowEnd], ascending, at most 10,001 (one more than
 * a calendar keeps, so a cap is known). Candidates are taken in ascending order, one week, month or
 * year per step (one date per step for daily ones), skipping ahead to the window when the dates
 * aren't counted by occurrences. 'unsupported' when 100,000 steps have added no date (D58).
 */
function expand(
  recurrence: Recurrence,
  windowStart: number,
  windowEnd: number,
): number[] | 'unsupported' {
  const { type, from, period } = recurrence;
  const end = Math.min(recurrence.to, windowEnd);
  const days: number[] = [];
  let occurrences = 0;
  let steps = 0;

  /** Takes one candidate; false when the expansion is over. */
  const take = (day: number | null): boolean => {
    if (day === null || day < from) return true;
    if (day > end) return false;
    if (recurrence.occurrences !== null && occurrences >= recurrence.occurrences) return false;
    occurrences += 1;
    if (day >= windowStart) days.push(day);
    return days.length <= MAX_RECURRENCE_DATES;
  };
  /** Counts a step; false when 100,000 steps have added no date. */
  const step = (): boolean => {
    steps += 1;
    return steps < MAX_STEPS_WITHOUT_DATE || days.length > 0;
  };
  const counted = recurrence.occurrences !== null;

  if (type === 1) {
    const skipped = Math.max(0, Math.ceil((windowStart - from) / period));
    occurrences = skipped; // each skipped day was an occurrence
    for (let k = skipped; take(from + k * period); k += 1) if (!step()) return 'unsupported';
    return days;
  }

  if (type === 6) {
    const firstWeek = from - weekdayOf(from);
    const stride = 7 * period;
    let week = counted ? 0 : Math.max(0, Math.floor((windowStart - firstWeek) / stride));
    for (; firstWeek + week * stride <= end; week += 1) {
      const weekStart = firstWeek + week * stride;
      for (let weekday = 0; weekday < 7; weekday += 1) {
        if ((recurrence.daysOfWeek & (1 << weekday)) !== 0 && !take(weekStart + weekday)) {
          return days;
        }
      }
      if (!step()) return 'unsupported';
    }
    return days;
  }

  const start = civilOfDayNumber(from);
  const window = civilOfDayNumber(windowStart);
  if (type === 4 || type === 5) {
    const firstMonth = start.year * 12 + start.month - 1;
    const windowMonth = window.year * 12 + window.month - 1;
    let k = counted ? 0 : Math.max(0, Math.floor((windowMonth - firstMonth) / period));
    for (; ; k += 1) {
      const index = firstMonth + k * period;
      const year = Math.floor(index / 12);
      const month = (index % 12) + 1;
      if (dayNumberOfCivil(year, month, 1) > end) return days;
      const day =
        type === 4
          ? recurrence.monthDay <= daysInMonth(year, month)
            ? dayNumberOfCivil(year, month, recurrence.monthDay)
            : null
          : dayAtPosition(year, month, recurrence.monthItem, recurrence.monthPosition);
      if (!take(day)) return days;
      if (!step()) return 'unsupported';
    }
  }

  // Yearly (types 2 and 3): every year, in the recurrence's month.
  const { month } = recurrence;
  for (let year = counted ? start.year : Math.max(start.year, window.year); ; year += 1) {
    if (dayNumberOfCivil(year, month, 1) > end) return days;
    const day =
      type === 2
        ? recurrence.monthDay <= daysInMonth(year, month)
          ? dayNumberOfCivil(year, month, recurrence.monthDay)
          : null
        : dayAtPosition(year, month, recurrence.monthItem, recurrence.monthPosition);
    if (!take(day)) return days;
    if (!step()) return 'unsupported';
  }
}

// ---- One calendar as written ----

interface OwnCalendar {
  uid: string;
  name: string;
  location: string;
  baseUid: string | null;
  week: Array<Period[] | null>; // null: not listed
  exceptions: Array<{ date: ISODate; periods: Period[] }>; // sorted by date
  issues: ImportIssue[]; // what was adjusted in reading it
  failure: ImportIssue | null; // why it can't be read
}

interface ReadState {
  windowStart: number;
  windowEnd: number;
  expanded: number; // exception dates kept so far, across calendars, before inheritance
  datesDropped: boolean;
}

function failure(
  code: IssueCode,
  name: string,
  location: string,
  original: string | null = null,
): ImportIssue {
  return makeIssue(code, { name }, { location, original });
}

/**
 * A calendar's own dates in file order of its exception records; the first record listing a date
 * wins. Keeps the earliest 10,000 (CALENDAR_RECURRENCE_CAPPED with the last one kept). The UID's
 * and the name's bad references are XML_BAD_CHARACTER at the calendar.
 */
function readOwn(calendar: unknown, uid: DecodedText, name: string, state: ReadState): OwnCalendar {
  const location = calendarLocation(uid.text);
  const own: OwnCalendar = {
    uid: uid.text,
    name,
    location,
    baseUid: mspdiCalendarBase(calendar),
    week: [null, null, null, null, null, null, null],
    exceptions: [],
    issues: [],
    failure: null,
  };
  const fail = (code: IssueCode): OwnCalendar => ({
    ...own,
    issues: [],
    failure: failure(code, name, location),
  });

  for (const kept of [uid, decodedText(calendar, 'Name')]) {
    for (const value of new Set(kept?.badCharacters)) {
      own.issues.push(makeIssue('XML_BAD_CHARACTER', { value }, { location, original: value }));
    }
  }

  const legacy: unknown[] = [];
  for (const weekDay of listOf(childOf(childOf(calendar, 'WeekDays'), 'WeekDay'))) {
    const dayType = integerIn(readNumber(weekDay, 'DayType'), 0, 7);
    if (dayType === null) return fail('CALENDAR_UNREADABLE');
    if (dayType === 0) {
      legacy.push(weekDay);
      continue;
    }
    const periods = dayPeriods(weekDay);
    if (periods === null) return fail('CALENDAR_UNREADABLE');
    own.week[dayType - 1] ??= periods;
  }

  const workWeeks = listOf(childOf(childOf(calendar, 'WorkWeeks'), 'WorkWeek'));
  if (workWeeks.length > 0) own.issues.push(makeIssue('MSPDI_WORK_WEEKS', { name }, { location }));

  // Legacy DayType 0 exceptions only when the calendar has no Exceptions element (D58).
  const exceptionsElement = childOf(calendar, 'Exceptions');
  const records =
    exceptionsElement === undefined ? legacy : listOf(childOf(exceptionsElement, 'Exception'));
  const isLegacy = exceptionsElement === undefined;
  const byDay = new Map<number, Period[]>();
  let repaired = false;
  const compact = () => {
    // Only the earliest dates can be kept: drop all but one more than the cap.
    const kept = [...byDay.keys()].sort((a, b) => a - b).slice(MAX_RECURRENCE_DATES + 1);
    for (const day of kept) byDay.delete(day);
  };
  for (const record of records) {
    if (state.expanded + Math.min(byDay.size, MAX_RECURRENCE_DATES) > MAX_EXCEPTION_DATES) break;
    const typeValue = isLegacy ? 1 : (readNumber(record, 'Type') ?? 1);
    const type = integerIn(typeValue, 1, 6);
    if (type === null) return fail('CALENDAR_RECURRENCE_UNSUPPORTED');
    const timePeriod = childOf(record, 'TimePeriod');
    const fromDate = readDate(timePeriod, 'FromDate');
    const toDate = readDate(timePeriod, 'ToDate');
    state.datesDropped ||= fromDate.dropped || toDate.dropped;
    // An exception record without both dates, or whose dates run backwards, is skipped (D58).
    const from = fromDate.value === null ? null : dayNumberOf(fromDate.value.slice(0, 10));
    const to = toDate.value === null ? null : dayNumberOf(toDate.value.slice(0, 10));
    if (from === null || to === null || from > to) {
      repaired = true;
      continue;
    }
    const periods = dayPeriods(record);
    if (periods === null) return fail('CALENDAR_UNREADABLE');
    const recurrence = recurrenceOf(record, isLegacy ? 1 : type, from, to);
    if (recurrence === null) return fail('CALENDAR_RECURRENCE_UNSUPPORTED');
    if (isLegacy) recurrence.period = 1;
    const days = expand(recurrence, state.windowStart, state.windowEnd);
    if (days === 'unsupported') return fail('CALENDAR_RECURRENCE_UNSUPPORTED');
    for (const day of days) if (!byDay.has(day)) byDay.set(day, periods);
    if (byDay.size > 2 * MAX_RECURRENCE_DATES) compact();
  }
  if (repaired) own.issues.push(makeIssue('CALENDAR_DATA_REPAIRED', { name }, { location }));

  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (days.length > MAX_RECURRENCE_DATES) {
    days.length = MAX_RECURRENCE_DATES;
    const date = isoDateOfDayNumber(days[days.length - 1]!);
    own.issues.push(makeIssue('CALENDAR_RECURRENCE_CAPPED', { name, date }, { location }));
  }
  own.exceptions = days.map((day) => ({ date: isoDateOfDayNumber(day), periods: byDay.get(day)! }));
  state.expanded += own.exceptions.length;
  return own;
}

// ---- All calendars ----

function addYears(date: ISODate, years: number): number {
  const year = Number(date.slice(0, 4)) + years;
  const month = Number(date.slice(5, 7));
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(year, month));
  return dayNumberOfCivil(year, month, day);
}

/** The week's working hours. */
function weekHours(week: Period[][]): number {
  const minutes = week.flat().reduce((total, period) => total + period.finish - period.start, 0);
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * The calendars of a file by UID, in file order, with their issues in file order. Unreadable
 * calendars are left out and named in `unreadable`, each with one error: CALENDAR_UNREADABLE,
 * CALENDAR_BASE_MISSING or CALENDAR_RECURRENCE_UNSUPPORTED. More than 100,000 exception dates
 * across the calendars, counted after inheritance as the XER reader counts them, give
 * FILE_TOO_MANY_EXCEPTIONS (D57); expansion also stops once the dates kept pass that limit.
 */
export function readMspdiCalendars(
  calendars: unknown[],
  span: { start: ISODate; finish: ISODate },
): { calendars: Map<string, ImportCalendar>; issues: ImportIssue[]; unreadable: Set<string> } {
  const state: ReadState = {
    windowStart: dayNumberOf(span.start),
    windowEnd: addYears(span.finish, WINDOW_YEARS),
    expanded: 0,
    datesDropped: false,
  };
  const owns = new Map<string, OwnCalendar>();
  // One entry per Calendar element, in file order: the calendar read, or the issue skipping it.
  const entries: Array<OwnCalendar | ImportIssue> = [];
  calendars.forEach((calendar, index) => {
    const uid = decodedText(calendar, 'UID');
    const name = decodedText(calendar, 'Name')?.text ?? uid?.text ?? `#${index + 1}`;
    if (uid === null || owns.has(uid.text)) {
      // Nothing can name it: a calendar without a UID, or a second one with the same UID.
      const location = uid === null ? null : calendarLocation(uid.text);
      entries.push(makeIssue('CALENDAR_UNUSED_SKIPPED', { name }, { location }));
      return;
    }
    const own = readOwn(calendar, uid, name, state);
    owns.set(uid.text, own);
    entries.push(own);
  });

  // Inheritance: a calendar is readable when it and every base up its chain (at most 5) are.
  const unreadable = new Set<string>();
  const chains = new Map<string, string[]>();
  for (const own of owns.values()) {
    if (own.failure) {
      unreadable.add(own.uid);
      continue;
    }
    const chain: string[] = [];
    const seen = new Set([own.uid]);
    let problem: IssueCode | null = null;
    for (let base = own.baseUid; base !== null; base = owns.get(base)!.baseUid) {
      if (!owns.has(base)) {
        problem = chain.length === 0 ? 'CALENDAR_BASE_MISSING' : 'CALENDAR_UNREADABLE';
        break;
      }
      if (seen.has(base) || chain.length === MAX_BASE_LEVELS || owns.get(base)!.failure) {
        problem = 'CALENDAR_UNREADABLE';
        break;
      }
      seen.add(base);
      chain.push(base);
    }
    if (problem !== null) {
      unreadable.add(own.uid);
      const original = problem === 'CALENDAR_BASE_MISSING' ? own.baseUid : null;
      own.failure = failure(problem, own.name, own.location, original);
    } else {
      chains.set(own.uid, chain);
    }
  }

  const resolved = new Map<string, ImportCalendar>();
  let total = 0;
  let tooMany = state.expanded > MAX_EXCEPTION_DATES;
  const resolve = (uid: string): ImportCalendar => {
    const known = resolved.get(uid);
    if (known) return known;
    const own = owns.get(uid)!;
    const baseUid = chains.get(uid)![0];
    const base = baseUid === undefined ? null : resolve(baseUid);
    const week = own.week.map((periods, day) => periods ?? base?.week[day] ?? []);
    let exceptions = own.exceptions;
    if (base && base.exceptions.length > 0 && !tooMany) {
      const listed = new Set(own.exceptions.map((exception) => exception.date));
      exceptions = [...own.exceptions];
      for (const exception of base.exceptions) {
        if (!listed.has(exception.date)) exceptions.push(exception);
      }
      exceptions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    const calendar: ImportCalendar = {
      id: uid,
      name: own.name,
      kind: 'global',
      week,
      exceptions,
      hoursPerDay: weekHoursPerDay(week) ?? 8,
      hoursPerWeek: weekHours(week),
      hoursPerMonth: null,
      hoursPerYear: null,
    };
    resolved.set(uid, calendar);
    return calendar;
  };
  const result = new Map<string, ImportCalendar>();
  for (const own of owns.values()) {
    if (unreadable.has(own.uid)) continue;
    const calendar = resolve(own.uid);
    result.set(own.uid, calendar);
    total += calendar.exceptions.length;
    if (total > MAX_EXCEPTION_DATES) tooMany = true;
  }

  const issues: ImportIssue[] = [];
  for (const entry of entries) {
    if (!('uid' in entry)) issues.push(entry);
    // An unreadable calendar has exactly one issue, its reason (found reading it or its chain).
    else if (entry.failure) issues.push(entry.failure);
    else for (const issue of entry.issues) issues.push(issue);
  }
  if (state.datesDropped) issues.push(makeIssue('MSPDI_DATE_ZONE_DROPPED'));
  if (tooMany) issues.push(makeIssue('FILE_TOO_MANY_EXCEPTIONS'));
  return { calendars: result, issues, unreadable };
}
