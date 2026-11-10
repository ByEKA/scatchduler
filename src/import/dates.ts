import type { ImportDateFormat, ISODate } from '@/data/types';
import { foldForMatch } from '@/lib/search';
import type { WallClock } from './model';

// Source timestamps are wall-clock times without a zone (P3 core spec §5.4), read with regular
// expressions and arithmetic only: never `new Date(string)`, and no time zone is involved.

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (MONTH_DAYS[month - 1] ?? 0);
}

function isValidDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function isValidTime(hour: number, minute: number, second = 0): boolean {
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function isoDate(year: number, month: number, day: number): ISODate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

function wallClock(date: ISODate, hour: number, minute: number): WallClock {
  return `${date}T${pad(hour)}:${pad(minute)}`;
}

// Days from 1970-01-01 and back, for the proleptic Gregorian calendar (H. Hinnant's algorithms).
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
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

const XER_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?)?$/;

/** XER: `yyyy-M-d[ H[:mm[:ss]]]`; seconds are dropped. */
export function parseXerDate(text: string): WallClock | null | 'invalid' {
  const value = text.trim();
  if (value === '') return null;
  const match = XER_DATE.exec(value);
  if (!match) return 'invalid';
  const [year, month, day, hour, minute, second] = match
    .slice(1)
    .map((part) => (part === undefined ? 0 : Number(part)));
  if (year === undefined || month === undefined || day === undefined) return 'invalid';
  if (!isValidDate(year, month, day) || !isValidTime(hour ?? 0, minute ?? 0, second ?? 0)) {
    return 'invalid';
  }
  return wallClock(isoDate(year, month, day), hour ?? 0, minute ?? 0);
}

const XER_DAY_EPOCH = daysFromCivil(1899, 12, 30);

/** A P6 `clndr_data` day number (days since 1899-12-30) as a date; null outside 1900–9999. */
export function xerDayToIsoDate(days: number): ISODate | null {
  if (!Number.isSafeInteger(days)) return null;
  const { year, month, day } = civilFromDays(XER_DAY_EPOCH + days);
  if (year < 1900 || year > 9999) return null;
  return isoDate(year, month, day);
}

const MSPDI_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/;

/** MSPDI: `yyyy-MM-ddTHH:mm:ss`; seconds are dropped. */
export function parseMspdiDate(text: string): WallClock | null | 'invalid' {
  const value = text.trim();
  if (value === '') return null;
  const match = MSPDI_DATE.exec(value);
  if (!match) return 'invalid';
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    !isValidDate(year, month, day) ||
    !isValidTime(hour, minute, second ?? 0)
  ) {
    return 'invalid';
  }
  return wallClock(isoDate(year, month, day), hour, minute);
}

export interface TableDate {
  date: ISODate;
  time: string | null; // 'HH:mm'
}

// Month and weekday names in English and Turkish, full or three letters, folded with foldForMatch.
const MONTHS: ReadonlyMap<string, number> = new Map(
  [
    ['january', 'jan', 'ocak', 'oca'],
    ['february', 'feb', 'subat', 'sub'],
    ['march', 'mar', 'mart'],
    ['april', 'apr', 'nisan', 'nis'],
    ['may', 'mayis'],
    ['june', 'jun', 'haziran', 'haz'],
    ['july', 'jul', 'temmuz', 'tem'],
    ['august', 'aug', 'agustos', 'agu'],
    ['september', 'sep', 'eylul', 'eyl'],
    ['october', 'oct', 'ekim', 'eki'],
    ['november', 'nov', 'kasim', 'kas'],
    ['december', 'dec', 'aralik', 'ara'],
  ].flatMap((names, index) => names.map((name) => [name, index + 1] as const)),
);

const WEEKDAYS: ReadonlySet<string> = new Set([
  ...['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
  ...['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  ...['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'],
  ...['paz', 'pzt', 'sal', 'car', 'per', 'cum', 'cmt'],
]);

// Where day, month and year sit, and the separators an all-number date may use, per format: its
// own, and one no other format with the same order uses ('-' for both day-first formats, '/' and
// '.' for YYYY-MM-DD). DD.MM.YYYY still refuses '/', so 15/03/2026 is guessed as DD/MM/YYYY.
const LAYOUTS: Record<
  ImportDateFormat,
  { order: ['d' | 'm' | 'y', 'd' | 'm' | 'y', 'd' | 'm' | 'y']; separators: readonly string[] }
> = {
  'DD.MM.YYYY': { order: ['d', 'm', 'y'], separators: ['.', '-'] },
  'DD/MM/YYYY': { order: ['d', 'm', 'y'], separators: ['/', '-'] },
  'MM/DD/YYYY': { order: ['m', 'd', 'y'], separators: ['/'] },
  'YYYY-MM-DD': { order: ['y', 'm', 'd'], separators: ['-', '/', '.'] },
};

const LEADING_WORD = /^(\p{L}+)\.?,?\s+/u;
// A time at the end: 08:00, 8:00:30, 8:00 AM, 8 PM; after a space, or after the date's 'T'.
const CLOCK_TIME = /(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([ap])\.?m\.?)?$/i;
const HOUR_TIME = /\s+(\d{1,2})\s*([ap])\.?m\.?$/i;

function readTime(text: string): { rest: string; time: string | null } | 'invalid' {
  const clock = CLOCK_TIME.exec(text);
  const hourOnly = clock ? null : HOUR_TIME.exec(text);
  const match = clock ?? hourOnly;
  if (!match) return { rest: text, time: null };
  let hour = Number(match[1]);
  const minute = clock ? Number(clock[2]) : 0;
  const second = clock?.[3] === undefined ? 0 : Number(clock[3]);
  const meridiem = (clock ? clock[4] : hourOnly?.[2])?.toLowerCase();
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) return 'invalid';
    hour = (hour % 12) + (meridiem === 'p' ? 12 : 0);
  }
  if (!isValidTime(hour, minute, second)) return 'invalid';
  return { rest: text.slice(0, match.index), time: `${pad(hour)}:${pad(minute)}` };
}

// Four digits; two (→ 20yy) only where the year comes last (D49), so 15-Mar-26 isn't YYYY-MM-DD.
function readYear(token: string, twoDigits: boolean): number | null {
  if (/^\d{4}$/.test(token)) return Number(token);
  if (twoDigits && /^\d{2}$/.test(token)) return 2000 + Number(token);
  return null;
}

function readDayOrMonth(token: string): number | null {
  return /^\d{1,2}$/.test(token) ? Number(token) : null;
}

function readDate(text: string, format: ImportDateFormat): ISODate | null {
  const { order, separators } = LAYOUTS[format];
  // An all-number date uses one of the format's separators throughout; one with a month name, in
  // the month's place, may use spaces, commas, periods, hyphens or slashes.
  const numbers = separators
    .map((separator) => text.split(separator))
    .find((split) => split.length === 3 && split.every((token) => /^\d+$/.test(token)));
  const numeric = numbers !== undefined;
  const tokens = numbers ?? text.split(/[\s,./-]+/).filter((token) => token !== '');
  if (tokens.length !== 3) return null;

  const parts: Partial<Record<'d' | 'm' | 'y', number>> = {};
  for (const [index, place] of order.entries()) {
    const token = tokens[index] ?? '';
    let value: number | null;
    if (place === 'y') value = readYear(token, index === order.length - 1);
    else if (place === 'd') value = readDayOrMonth(token);
    else value = numeric ? readDayOrMonth(token) : (MONTHS.get(foldForMatch(token)) ?? null);
    if (value === null) return null;
    parts[place] = value;
  }
  const { d, m, y } = parts;
  if (d === undefined || m === undefined || y === undefined || !isValidDate(y, m, d)) return null;
  return isoDate(y, m, d);
}

/**
 * A table cell in the chosen format: one- or two-digit days and months, four-digit years or, where
 * the year comes last, two-digit ones (→ 20yy), an optional weekday name in front (skipped, not
 * checked), a month name in the month's place and an optional time.
 */
export function parseTableDate(
  text: string,
  format: ImportDateFormat,
): TableDate | null | 'invalid' {
  // Whitespace runs become one space first, which also keeps the time patterns from backtracking
  // over a long run (they aren't anchored at the start).
  let value = text.trim().replace(/\s+/g, ' ');
  if (value === '') return null;
  const time = readTime(value);
  if (time === 'invalid') return 'invalid';
  value = time.rest.trim();
  const weekday = LEADING_WORD.exec(value);
  if (weekday && WEEKDAYS.has(foldForMatch(weekday[1] ?? ''))) {
    value = value.slice(weekday[0].length);
  }
  const date = readDate(value, format);
  return date === null ? 'invalid' : { date, time: time.time };
}

const MINUTES_PER_DAY = 1440;
const EXCEL_1900_EPOCH = daysFromCivil(1899, 12, 30);
const EXCEL_1904_EPOCH = daysFromCivil(1904, 1, 1);

// The calendar date and minute of the day of an xlsx date serial, rounded to the minute. The 1900
// system counts the false 29 February 1900 as day 60, so serials before it are one day later than
// the epoch suggests.
function excelSerialParts(
  serial: number,
  date1904: boolean,
): { year: number; month: number; day: number; minuteOfDay: number } {
  const totalMinutes = Math.round(serial * MINUTES_PER_DAY);
  const wholeDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const minuteOfDay = totalMinutes - wholeDays * MINUTES_PER_DAY;
  let days: number;
  if (date1904) days = EXCEL_1904_EPOCH + wholeDays;
  else days = EXCEL_1900_EPOCH + wholeDays + (wholeDays < 60 ? 1 : 0);
  return { ...civilFromDays(days), minuteOfDay };
}

/**
 * Whether an xlsx date serial is a real date: finite, not negative, and in 1900–9999 once rounded
 * to the minute (Excel's own range). excelSerialToWallClock gives malformed text outside it
 * (NaN → '0NaN-NaN-NaNTNaN:NaN', 3e6 → '10113-09-19T00:00'), so Task 12's table normalizer
 * (table/normalize.ts) must check this first and never convert a serial it refuses.
 */
export function isExcelSerialInRange(serial: number, date1904: boolean): boolean {
  if (!Number.isFinite(serial) || serial < 0) return false;
  const { year } = excelSerialParts(serial, date1904);
  return year >= 1900 && year <= 9999;
}

/**
 * An xlsx date serial as wall-clock text, rounded to the minute. Only for serials that
 * isExcelSerialInRange accepts; callers check it first.
 */
export function excelSerialToWallClock(serial: number, date1904: boolean): WallClock {
  const { year, month, day, minuteOfDay } = excelSerialParts(serial, date1904);
  return wallClock(isoDate(year, month, day), Math.floor(minuteOfDay / 60), minuteOfDay % 60);
}

const GUESS_ORDER: readonly ImportDateFormat[] = [
  'YYYY-MM-DD',
  'DD.MM.YYYY',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
];

/** The first format that reads every non-empty sample; DD.MM.YYYY when none does. */
export function guessDateFormat(samples: readonly string[]): ImportDateFormat {
  const values = samples.map((sample) => sample.trim()).filter((sample) => sample !== '');
  if (values.length === 0) return 'DD.MM.YYYY';
  const format = GUESS_ORDER.find((candidate) =>
    values.every((value) => {
      const result = parseTableDate(value, candidate);
      return result !== null && result !== 'invalid';
    }),
  );
  return format ?? 'DD.MM.YYYY';
}
