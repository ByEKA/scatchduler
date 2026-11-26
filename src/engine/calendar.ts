import type { ScheduleCalendar, ScheduleCalendarPeriod } from '@/data/schedule-types';
import { civilDaysFromIsoDate, MINUTES_PER_DAY } from '@/engine/time';

export interface CompiledCalendar {
  readonly id: string;
  readonly name: string;
  readonly hoursPerDay: number;
  readonly isElapsed: boolean;
}

const INITIAL_HALF_SPAN_DAYS = 1825; // ~5 years each side of first query
const EXPAND_PAD_DAYS = 730; // ~2 years extra buffer on range expansion

function normalizePeriods(
  raw: readonly ScheduleCalendarPeriod[] | undefined,
): readonly ScheduleCalendarPeriod[] {
  if (!raw || raw.length === 0) return [];
  const valid: ScheduleCalendarPeriod[] = [];
  for (const p of raw) {
    const start = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(p.start)));
    const finish = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(p.finish)));
    if (finish > start) {
      valid.push({ start, finish });
    }
  }
  if (valid.length <= 1) return valid;
  valid.sort((a, b) => (a.start !== b.start ? a.start - b.start : a.finish - b.finish));
  const merged: ScheduleCalendarPeriod[] = [valid[0]!];
  for (let i = 1; i < valid.length; i++) {
    const cur = valid[i]!;
    const prev = merged[merged.length - 1]!;
    if (cur.start <= prev.finish) {
      if (cur.finish > prev.finish) {
        prev.finish = cur.finish;
      }
    } else {
      merged.push({ start: cur.start, finish: cur.finish });
    }
  }
  return merged;
}

function periodMinutes(periods: readonly ScheduleCalendarPeriod[]): number {
  let sum = 0;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]!;
    sum += p.finish - p.start;
  }
  return sum;
}

function workWithinDay(periods: readonly ScheduleCalendarPeriod[], offset: number): number {
  let w = 0;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]!;
    if (offset <= p.start) break;
    if (offset >= p.finish) {
      w += p.finish - p.start;
    } else {
      w += offset - p.start;
      break;
    }
  }
  return w;
}

function dayOfWeekFromDay(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

class CompiledCalendarImpl implements CompiledCalendar {
  readonly id: string;
  readonly name: string;
  readonly hoursPerDay: number;
  readonly isElapsed: boolean;

  private readonly week: readonly (readonly ScheduleCalendarPeriod[])[];
  private readonly exceptions: ReadonlyMap<number, readonly ScheduleCalendarPeriod[]>;
  private readonly weeklyMinutes: number;

  // Finite sorted table used only when weeklyMinutes === 0 (exceptions-only calendar).
  private readonly exDays: readonly number[];
  private readonly exPeriods: readonly (readonly ScheduleCalendarPeriod[])[];
  private readonly exPrefix: readonly number[];

  // Lazy day-unrolled prefix-sum table used when !isElapsed && weeklyMinutes > 0.
  // Invariant: prefix[i] is signed working minutes from the fixed initial origin to (startDay + i) * 1440.
  private initialized = false;
  private startDay = 0;
  private endDay = 0;
  private dayPeriods: Array<readonly ScheduleCalendarPeriod[]> = [];
  private prefix: number[] = [];

  constructor(options: {
    id: string;
    name: string;
    hoursPerDay: number;
    isElapsed: boolean;
    week: readonly (readonly ScheduleCalendarPeriod[])[];
    exceptions: ReadonlyMap<number, readonly ScheduleCalendarPeriod[]>;
    weeklyMinutes: number;
  }) {
    this.id = options.id;
    this.name = options.name;
    this.hoursPerDay = options.hoursPerDay;
    this.isElapsed = options.isElapsed;
    this.week = options.week;
    this.exceptions = options.exceptions;
    this.weeklyMinutes = options.weeklyMinutes;

    if (!options.isElapsed && options.weeklyMinutes === 0) {
      const entries: Array<[number, readonly ScheduleCalendarPeriod[]]> = [];
      for (const [day, periods] of options.exceptions) {
        if (periods.length > 0) entries.push([day, periods]);
      }
      entries.sort((a, b) => a[0] - b[0]);
      const days: number[] = [];
      const periods: Array<readonly ScheduleCalendarPeriod[]> = [];
      const prefix: number[] = [0];
      let acc = 0;
      for (const [day, ps] of entries) {
        days.push(day);
        periods.push(ps);
        acc += periodMinutes(ps);
        prefix.push(acc);
      }
      this.exDays = days;
      this.exPeriods = periods;
      this.exPrefix = prefix;
    } else {
      this.exDays = [];
      this.exPeriods = [];
      this.exPrefix = [0];
    }
  }

  private periodsForDay(day: number): readonly ScheduleCalendarPeriod[] {
    const ex = this.exceptions.get(day);
    if (ex !== undefined) return ex;
    return this.week[dayOfWeekFromDay(day)]!;
  }

  isDayNonWorking(day: number): boolean {
    if (this.isElapsed) return false;
    return this.periodsForDay(day).length === 0;
  }

  private initAround(day: number): void {
    this.startDay = day - INITIAL_HALF_SPAN_DAYS;
    this.endDay = day + INITIAL_HALF_SPAN_DAYS;
    const len = this.endDay - this.startDay;
    this.dayPeriods = new Array<readonly ScheduleCalendarPeriod[]>(len);
    this.prefix = new Array<number>(len + 1);
    let acc = 0;
    this.prefix[0] = 0;
    for (let i = 0; i < len; i++) {
      const ps = this.periodsForDay(this.startDay + i);
      this.dayPeriods[i] = ps;
      acc += periodMinutes(ps);
      this.prefix[i + 1] = acc;
    }
    this.initialized = true;
  }

  private expandBackward(targetStartDay: number): void {
    const newStart = Math.min(targetStartDay, this.startDay - EXPAND_PAD_DAYS);
    const addCount = this.startDay - newStart;
    if (addCount <= 0) return;

    const oldLen = this.dayPeriods.length;
    const newPeriods = new Array<readonly ScheduleCalendarPeriod[]>(addCount + oldLen);
    const relPrefix = new Array<number>(addCount + 1);
    let acc = 0;
    relPrefix[0] = 0;
    for (let i = 0; i < addCount; i++) {
      const ps = this.periodsForDay(newStart + i);
      newPeriods[i] = ps;
      acc += periodMinutes(ps);
      relPrefix[i + 1] = acc;
    }
    for (let i = 0; i < oldLen; i++) {
      newPeriods[addCount + i] = this.dayPeriods[i]!;
    }

    const baseOffset = this.prefix[0]! - acc;
    const newPrefix = new Array<number>(addCount + oldLen + 1);
    for (let i = 0; i < addCount; i++) {
      newPrefix[i] = baseOffset + relPrefix[i]!;
    }
    for (let i = 0; i <= oldLen; i++) {
      newPrefix[addCount + i] = this.prefix[i]!;
    }

    this.startDay = newStart;
    this.dayPeriods = newPeriods;
    this.prefix = newPrefix;
  }

  private expandForward(targetEndDay: number): void {
    const newEnd = Math.max(targetEndDay, this.endDay + EXPAND_PAD_DAYS);
    const addCount = newEnd - this.endDay;
    if (addCount <= 0) return;

    let acc = this.prefix[this.prefix.length - 1]!;
    for (let d = this.endDay; d < newEnd; d++) {
      const ps = this.periodsForDay(d);
      this.dayPeriods.push(ps);
      acc += periodMinutes(ps);
      this.prefix.push(acc);
    }
    this.endDay = newEnd;
  }

  private ensureDay(day: number): void {
    if (!this.initialized) {
      this.initAround(day);
      return;
    }
    if (day < this.startDay) {
      this.expandBackward(day - EXPAND_PAD_DAYS);
    } else if (day >= this.endDay) {
      this.expandForward(day + EXPAND_PAD_DAYS);
    }
  }

  cumWork(t: number): number {
    const whole = Math.trunc(t);
    const day = Math.floor(whole / MINUTES_PER_DAY);
    const offset = whole - day * MINUTES_PER_DAY;

    if (this.weeklyMinutes === 0) {
      const n = this.exDays.length;
      let lo = 0;
      let hi = n;
      // Find first index where exDays[idx] > day
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (this.exDays[mid]! <= day) lo = mid + 1;
        else hi = mid;
      }
      const idx = lo - 1;
      if (idx < 0) return 0;
      if (this.exDays[idx]! < day) return this.exPrefix[idx + 1]!;
      return this.exPrefix[idx]! + workWithinDay(this.exPeriods[idx]!, offset);
    }

    this.ensureDay(day);
    const idx = day - this.startDay;
    return this.prefix[idx]! + workWithinDay(this.dayPeriods[idx]!, offset);
  }

  /** Earliest instant `u` such that `cumWork(u) === target` (always a period finish or interior `(s, f]`). */
  earliestInstantForWork(target: number, fallback: number): number {
    if (this.weeklyMinutes === 0) {
      const k = this.exDays.length;
      const total = this.exPrefix[k]!;
      if (target <= 0) return fallback;
      if (target > total) {
        const lastPeriods = this.exPeriods[k - 1]!;
        const lastFinish =
          this.exDays[k - 1]! * MINUTES_PER_DAY + lastPeriods[lastPeriods.length - 1]!.finish;
        return Math.max(fallback, lastFinish);
      }
      let lo = 0;
      let hi = k - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (this.exPrefix[mid + 1]! < target) lo = mid + 1;
        else hi = mid;
      }
      return resolveEarliestInDay(
        this.exDays[lo]!,
        this.exPeriods[lo]!,
        target - this.exPrefix[lo]!,
      );
    }

    // Ensure prefix[0] < target <= prefix[len]
    while (this.prefix[0]! >= target) {
      const needed = this.prefix[0]! - target + 1;
      const estDays = Math.ceil((needed / this.weeklyMinutes) * 7) + EXPAND_PAD_DAYS;
      this.expandBackward(this.startDay - estDays);
    }
    while (this.prefix[this.prefix.length - 1]! < target) {
      const needed = target - this.prefix[this.prefix.length - 1]!;
      const estDays = Math.ceil((needed / this.weeklyMinutes) * 7) + EXPAND_PAD_DAYS;
      this.expandForward(this.endDay + estDays);
    }

    let lo = 0;
    let hi = this.dayPeriods.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.prefix[mid + 1]! < target) lo = mid + 1;
      else hi = mid;
    }
    return resolveEarliestInDay(
      this.startDay + lo,
      this.dayPeriods[lo]!,
      target - this.prefix[lo]!,
    );
  }

  /** Latest instant `u` such that `cumWork(u) === target` (always a period start or interior `[s, f)`). */
  latestInstantForWork(target: number, fallback: number): number {
    if (this.weeklyMinutes === 0) {
      const k = this.exDays.length;
      const total = this.exPrefix[k]!;
      if (target >= total) return fallback;
      if (target < 0) {
        const firstStart = this.exDays[0]! * MINUTES_PER_DAY + this.exPeriods[0]![0]!.start;
        return Math.min(fallback, firstStart);
      }
      let lo = 0;
      let hi = k - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (this.exPrefix[mid + 1]! <= target) lo = mid + 1;
        else hi = mid;
      }
      return resolveLatestInDay(this.exDays[lo]!, this.exPeriods[lo]!, target - this.exPrefix[lo]!);
    }

    // Ensure prefix[0] <= target < prefix[len]
    while (this.prefix[0]! > target) {
      const needed = this.prefix[0]! - target;
      const estDays = Math.ceil((needed / this.weeklyMinutes) * 7) + EXPAND_PAD_DAYS;
      this.expandBackward(this.startDay - estDays);
    }
    while (this.prefix[this.prefix.length - 1]! <= target) {
      const needed = target - this.prefix[this.prefix.length - 1]! + 1;
      const estDays = Math.ceil((needed / this.weeklyMinutes) * 7) + EXPAND_PAD_DAYS;
      this.expandForward(this.endDay + estDays);
    }

    let lo = 0;
    let hi = this.dayPeriods.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.prefix[mid + 1]! <= target) lo = mid + 1;
      else hi = mid;
    }
    return resolveLatestInDay(this.startDay + lo, this.dayPeriods[lo]!, target - this.prefix[lo]!);
  }
}

function resolveEarliestInDay(
  day: number,
  periods: readonly ScheduleCalendarPeriod[],
  remInput: number,
): number {
  let rem = remInput;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]!;
    const len = p.finish - p.start;
    if (rem <= len) {
      return day * MINUTES_PER_DAY + p.start + rem;
    }
    rem -= len;
  }
  const last = periods[periods.length - 1]!;
  return day * MINUTES_PER_DAY + last.finish;
}

function resolveLatestInDay(
  day: number,
  periods: readonly ScheduleCalendarPeriod[],
  remInput: number,
): number {
  let rem = remInput;
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]!;
    const len = p.finish - p.start;
    if (rem < len) {
      return day * MINUTES_PER_DAY + p.start + rem;
    }
    rem -= len;
  }
  const last = periods[periods.length - 1]!;
  return day * MINUTES_PER_DAY + last.finish;
}

const ALL_DAY: readonly ScheduleCalendarPeriod[] = [{ start: 0, finish: MINUTES_PER_DAY }];

/** Built-in virtual 24-hour calendar (0..1440 every day) for elapsed durations and lags. */
export const ELAPSED_CALENDAR: CompiledCalendar = new CompiledCalendarImpl({
  id: 'cal:elapsed_24h',
  name: '24 Hour Elapsed',
  hoursPerDay: 24,
  isElapsed: true,
  week: [ALL_DAY, ALL_DAY, ALL_DAY, ALL_DAY, ALL_DAY, ALL_DAY, ALL_DAY],
  exceptions: new Map(),
  weeklyMinutes: 7 * MINUTES_PER_DAY,
});

function asImpl(cal: CompiledCalendar): CompiledCalendarImpl {
  if (!(cal instanceof CompiledCalendarImpl)) {
    throw new Error(`Calendar ${cal.id} was not created by compileCalendar.`);
  }
  return cal;
}

export function compileCalendar(
  cal: ScheduleCalendar,
): CompiledCalendar | { code: 'CALENDAR_NO_WORKING_TIME'; calendarId: string; message: string } {
  const week: Array<readonly ScheduleCalendarPeriod[]> = [];
  let weeklyMinutes = 0;
  for (let dow = 0; dow < 7; dow++) {
    const periods = normalizePeriods(cal.week[dow]);
    week.push(periods);
    weeklyMinutes += periodMinutes(periods);
  }

  const exceptions = new Map<number, readonly ScheduleCalendarPeriod[]>();
  let hasWorkingException = false;
  for (const ex of cal.exceptions) {
    const day = civilDaysFromIsoDate(ex.date);
    const periods = normalizePeriods(ex.periods);
    exceptions.set(day, periods);
  }
  for (const periods of exceptions.values()) {
    if (periods.length > 0) {
      hasWorkingException = true;
      break;
    }
  }

  if (weeklyMinutes === 0 && !hasWorkingException) {
    return {
      code: 'CALENDAR_NO_WORKING_TIME',
      calendarId: cal.id,
      message: `Calendar ${cal.name} has no working hours. Dates can't be calculated.`,
    };
  }

  return new CompiledCalendarImpl({
    id: cal.id,
    name: cal.name,
    hoursPerDay: cal.hoursPerDay > 0 ? cal.hoursPerDay : 8,
    isElapsed: false,
    week,
    exceptions,
    weeklyMinutes,
  });
}

/** Earliest working-block start or interior instant `>= t`. */
export function snapForwardToWorkStart(cal: CompiledCalendar, t: number): number {
  const whole = Math.trunc(t);
  if (cal.isElapsed) return whole;
  const impl = asImpl(cal);
  const w = impl.cumWork(whole);
  return impl.latestInstantForWork(w, whole);
}

/** Latest working-block finish or interior instant `<= t`. */
export function snapBackwardToWorkFinish(cal: CompiledCalendar, t: number): number {
  const whole = Math.trunc(t);
  if (cal.isElapsed) return whole;
  const impl = asImpl(cal);
  const w = impl.cumWork(whole);
  return impl.earliestInstantForWork(w, whole);
}

/** Advances `minutes` of working time from `start` (positive lands on a work-block finish). */
export function addWorkingMinutes(cal: CompiledCalendar, start: number, minutes: number): number {
  const wholeStart = Math.trunc(start);
  const wholeMinutes = Math.trunc(minutes);
  if (wholeMinutes === 0) return wholeStart;
  if (wholeMinutes < 0) return subtractWorkingMinutes(cal, wholeStart, -wholeMinutes);
  if (cal.isElapsed) return wholeStart + wholeMinutes;
  const impl = asImpl(cal);
  const target = impl.cumWork(wholeStart) + wholeMinutes;
  return impl.earliestInstantForWork(target, wholeStart);
}

/** Rewinds `minutes` of working time from `finish` (positive lands on a work-block start). */
export function subtractWorkingMinutes(
  cal: CompiledCalendar,
  finish: number,
  minutes: number,
): number {
  const wholeFinish = Math.trunc(finish);
  const wholeMinutes = Math.trunc(minutes);
  if (wholeMinutes === 0) return wholeFinish;
  if (wholeMinutes < 0) return addWorkingMinutes(cal, wholeFinish, -wholeMinutes);
  if (cal.isElapsed) return wholeFinish - wholeMinutes;
  const impl = asImpl(cal);
  const target = impl.cumWork(wholeFinish) - wholeMinutes;
  return impl.latestInstantForWork(target, wholeFinish);
}

/** Signed working minutes between `a` and `b` (positive when `b > a`). */
export function workingMinutesBetween(cal: CompiledCalendar, a: number, b: number): number {
  const wholeA = Math.trunc(a);
  const wholeB = Math.trunc(b);
  if (wholeA === wholeB) return 0;
  if (cal.isElapsed) return wholeB - wholeA;
  const impl = asImpl(cal);
  return impl.cumWork(wholeB) - impl.cumWork(wholeA);
}

/** True when the civil day containing `dayStartMinute` has zero working periods. */
export function isNonWorkingDay(cal: CompiledCalendar, dayStartMinute: number): boolean {
  if (cal.isElapsed) return false;
  const impl = asImpl(cal);
  const day = Math.floor(Math.trunc(dayStartMinute) / MINUTES_PER_DAY);
  return impl.isDayNonWorking(day);
}
