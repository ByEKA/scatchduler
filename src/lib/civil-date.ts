import type { WallClock } from '@/data/schedule-types';

export const MINUTES_PER_DAY = 1440;

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;

/** Howard Hinnant's `days_from_civil`: days since `1970-01-01` (which maps to `0`). */
export function civilDaysFromYmd(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mAdj = month > 2 ? month - 3 : month + 9;
  const doy = Math.floor((153 * mAdj + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Exact inverse of {@link civilDaysFromYmd}. */
export function ymdFromCivilDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = month <= 2 ? y + 1 : y;
  return { year, month, day };
}

/** Day of week for a civil day count: `0 = Sunday .. 6 = Saturday` (`1970-01-01` is Thursday = `4`). */
export function dayOfWeekFromDays(days: number): number {
  return (((days + 4) % 7) + 7) % 7;
}

/** Parses `'YYYY-MM-DDTHH:mm'` or `'YYYY-MM-DD'` into integer civil minutes, or `null` if invalid. */
export function wallClockToCivilMinutes(wc: WallClock | null): number | null {
  if (wc === null) return null;
  const match = WALL_CLOCK_RE.exec(wc);
  if (!match) return null;
  const days = civilDaysFromYmd(Number(match[1]), Number(match[2]), Number(match[3]));
  const hours = match[4] !== undefined ? Number(match[4]) : 0;
  const mins = match[5] !== undefined ? Number(match[5]) : 0;
  return days * MINUTES_PER_DAY + hours * 60 + mins;
}

/** Number of days in `(year, month)` where `month` is 1..12. */
export function daysInMonth(year: number, month: number): number {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return civilDaysFromYmd(nextYear, nextMonth, 1) - civilDaysFromYmd(year, month, 1);
}

/** ISO-8601 week number (1..53) for a civil day count (Monday = start of week). */
export function isoWeekNumber(days: number): number {
  const dow = dayOfWeekFromDays(days); // 0=Sun..6=Sat
  const isoDow = dow === 0 ? 7 : dow; // 1=Mon..7=Sun
  const thursdayDays = days + (4 - isoDow);
  const { year } = ymdFromCivilDays(thursdayDays);
  const jan1Days = civilDaysFromYmd(year, 1, 1);
  return Math.floor((thursdayDays - jan1Days) / 7) + 1;
}
