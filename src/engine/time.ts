import type { WallClock } from '@/data/schedule-types';
import type { ISODate } from '@/data/types';

export const MINUTES_PER_DAY = 1440;

const WALL_CLOCK_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Howard Hinnant's `days_from_civil` algorithm.
 * Returns integer days since 1970-01-01 (which maps to 0), with zero `Date` or time zone usage.
 */
export function civilDaysFromYmd(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const mAdj = month > 2 ? month - 3 : month + 9; // [0, 11]
  const doy = Math.floor((153 * mAdj + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/**
 * Howard Hinnant's `civil_from_days` algorithm — exact inverse of {@link civilDaysFromYmd}.
 */
export function ymdFromCivilDays(days: number): { year: number; month: number; day: number } {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097; // [0, 146096]
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  ); // [0, 399]
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)); // [0, 365]
  const mp = Math.floor((5 * doy + 2) / 153); // [0, 11]
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1; // [1, 31]
  const month = mp < 10 ? mp + 3 : mp - 9; // [1, 12]
  const year = month <= 2 ? y + 1 : y;
  return { year, month, day };
}

export function civilDaysFromIsoDate(date: ISODate): number {
  const match = ISO_DATE_RE.exec(date);
  if (!match) {
    throw new Error(`Invalid ISO date: ${date}`);
  }
  return civilDaysFromYmd(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** Converts `'YYYY-MM-DDTHH:mm'` to integer civil minutes since `1970-01-01T00:00`. */
export function toMinutes(wc: WallClock): number {
  const match = WALL_CLOCK_RE.exec(wc);
  if (!match) {
    throw new Error(`Invalid wall-clock timestamp: ${wc}`);
  }
  const days = civilDaysFromYmd(Number(match[1]), Number(match[2]), Number(match[3]));
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  return days * MINUTES_PER_DAY + hours * 60 + minutes;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function pad4(n: number): string {
  if (n < 0) return `-${String(-n).padStart(4, '0')}`;
  return String(n).padStart(4, '0');
}

/** Exact inverse of {@link toMinutes}. */
export function toWallClock(minutes: number): WallClock {
  const whole = Math.trunc(minutes);
  const days = Math.floor(whole / MINUTES_PER_DAY);
  const rem = whole - days * MINUTES_PER_DAY;
  const hour = Math.floor(rem / 60);
  const min = rem - hour * 60;
  const { year, month, day } = ymdFromCivilDays(days);
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(min)}`;
}

/** Day of week for a civil minute instant: `0 = Sunday .. 6 = Saturday` (`1970-01-01` is Thursday = `4`). */
export function dayOfWeek(minutes: number): number {
  const days = Math.floor(Math.trunc(minutes) / MINUTES_PER_DAY);
  return (((days + 4) % 7) + 7) % 7;
}

/** Floors a civil minute instant to `00:00` of its civil day. */
export function startOfCivilDay(minutes: number): number {
  return Math.floor(Math.trunc(minutes) / MINUTES_PER_DAY) * MINUTES_PER_DAY;
}

/** Extracts `'YYYY-MM-DD'` from a civil minute instant. */
export function isoDateFromMinutes(minutes: number): ISODate {
  const days = Math.floor(Math.trunc(minutes) / MINUTES_PER_DAY);
  const { year, month, day } = ymdFromCivilDays(days);
  return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}
