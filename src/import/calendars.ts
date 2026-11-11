import type { ISODate } from '@/data/types';
import { foldForMatch } from '@/lib/search';
import type { ImportCalendar, Period } from './model';

// Calendars the readers generate (P3 core spec §5.6, §5.7; ids starting with `gen:`, D43), the
// working periods of a calendar day, and the day arithmetic calendar readers need: pure integer
// arithmetic on the proleptic Gregorian calendar, no Date objects and no time zone.

export const STANDARD_CALENDAR_ID = 'gen:standard';
export const ELAPSED_CALENDAR_ID = 'gen:24h';

const DAY_MINUTES = 1440;
const WORK_START = 480; // 08:00
const BREAK_START = 720; // 12:00
const BREAK_MINUTES = 60;

/**
 * One working day of the standard week: from 08:00, `hoursPerDay` hours, with a 1-hour break at
 * 12:00 when `hoursPerDay` > 4. A day that wouldn't end by 24:00 (more than 15 hours) starts
 * early enough to end at 24:00, keeping its break while there is room for it (D61).
 */
function standardDay(hoursPerDay: number): Period[] {
  const work = Math.min(DAY_MINUTES, Math.max(0, Math.round(hoursPerDay * 60)));
  // More than 4 hours once rounded to the minute, so a break never leaves an empty period.
  const withBreak = work > BREAK_START - WORK_START && work + BREAK_MINUTES <= DAY_MINUTES;
  const span = work + (withBreak ? BREAK_MINUTES : 0);
  const start = Math.min(WORK_START, DAY_MINUTES - span);
  if (!withBreak) return [{ start, finish: start + work }];
  return [
    { start, finish: BREAK_START },
    { start: BREAK_START + BREAK_MINUTES, finish: start + span },
  ];
}

/** The standard day's start as HH:MM, the {start} of the generated-calendar copy (D61). */
export function standardStartTime(hoursPerDay: number): string {
  const start = standardDay(hoursPerDay)[0]!.start;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(start / 60))}:${pad(start % 60)}`;
}

/** Monday to Friday as standardDay, Saturday and Sunday off; 0 = Sunday. */
function standardWeek(hoursPerDay: number): Period[][] {
  return Array.from({ length: 7 }, (_, weekday) =>
    weekday === 0 || weekday === 6 ? [] : standardDay(hoursPerDay),
  );
}

/** "Standard", the project's generated default calendar (§5.7). */
export function standardCalendar(hoursPerDay: number): ImportCalendar {
  return {
    id: STANDARD_CALENDAR_ID,
    name: 'Standard',
    kind: 'project',
    week: standardWeek(hoursPerDay),
    exceptions: [],
    hoursPerDay,
    hoursPerWeek: hoursPerDay * 5,
    hoursPerMonth: null,
    hoursPerYear: null,
  };
}

/** A calendar named in a table, with the standard week (§5.7). */
export function calendarFromName(name: string, hoursPerDay: number): ImportCalendar {
  return {
    ...standardCalendar(hoursPerDay),
    id: `gen:name:${foldForMatch(name)}`,
    name,
    kind: 'global',
  };
}

/** "24 hours", for elapsed durations: every day from 00:00 to 24:00 (§5.6). */
export function elapsedCalendar(): ImportCalendar {
  return {
    id: ELAPSED_CALENDAR_ID,
    name: '24 hours',
    kind: 'task',
    week: Array.from({ length: 7 }, () => [{ start: 0, finish: DAY_MINUTES }]),
    exceptions: [],
    hoursPerDay: 24,
    hoursPerWeek: 168,
    hoursPerMonth: null,
    hoursPerYear: null,
  };
}

/**
 * The working periods of `date`: its exception's, else its weekday's. Exceptions are sorted by
 * date, as every reader writes them, so they are searched by halves.
 */
export function workingDay(calendar: ImportCalendar, date: ISODate): Period[] {
  const { exceptions } = calendar;
  let low = 0;
  let high = exceptions.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const entry = exceptions[middle]!;
    if (entry.date === date) return entry.periods;
    if (entry.date < date) low = middle + 1;
    else high = middle - 1;
  }
  return calendar.week[weekdayOf(dayNumberOf(date))] ?? [];
}

/** Hours per day of a work week: the most common length of its working days, the longer on a tie. */
export function weekHoursPerDay(week: readonly Period[][]): number | null {
  const counts = new Map<number, number>();
  for (const day of week) {
    const minutes = day.reduce((total, period) => total + period.finish - period.start, 0);
    if (minutes > 0) counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
  }
  let best: [number, number] | null = null;
  for (const entry of counts) {
    if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] > best[0])) best = entry;
  }
  return best === null ? null : Math.round((best[0] / 60) * 100) / 100;
}

// ---- Day numbers: days from 1970-01-01 (H. Hinnant's civil-calendar algorithms) ----

export interface CivilDate {
  year: number;
  month: number; // 1–12
  day: number;
}

export function dayNumberOfCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function civilOfDayNumber(dayNumber: number): CivilDate {
  const z = dayNumber + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth + (shiftedMonth < 10 ? 3 : -9);
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

/** The day number of a valid `YYYY-MM-DD` date. */
export function dayNumberOf(date: ISODate): number {
  return dayNumberOfCivil(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)),
    Number(date.slice(8, 10)),
  );
}

export function isoDateOfDayNumber(dayNumber: number): ISODate {
  const { year, month, day } = civilOfDayNumber(dayNumber);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** 0 = Sunday … 6 = Saturday (1970-01-01 was a Thursday). */
export function weekdayOf(dayNumber: number): number {
  return (((dayNumber + 4) % 7) + 7) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return (
    dayNumberOfCivil(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) -
    dayNumberOfCivil(year, month, 1)
  );
}
