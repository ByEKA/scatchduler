import type { ScheduleActivity, ScheduleDocument, WallClock } from '@/data/schedule-types';
import { wallClockToCivilMinutes } from '@/lib/civil-date';

/** The start and finish an activity shows to the user; `null` when it has none. */
export interface ProgressDates {
  start: WallClock | null;
  finish: WallClock | null;
}

/** The activity fields a % complete edit changes (P4 core D13). */
export type ProgressChanges = Pick<
  ScheduleActivity,
  'status' | 'actualStart' | 'actualFinish' | 'remainingDuration' | 'percent'
>;

/**
 * The dates the user sees for an activity, by the same rule as the grid rows: the calculated early
 * dates in Calculated mode, else the imported early dates, then the imported planned dates, else
 * nothing.
 */
export function activityDisplayDates(
  document: ScheduleDocument,
  activity: ScheduleActivity,
): ProgressDates {
  const computed =
    document.settings.displayMode === 'calculated'
      ? document.computed?.activities[activity.id]
      : undefined;
  return {
    start:
      computed?.earlyStart ??
      activity.sourceDates?.early.start ??
      activity.sourceDates?.planned.start ??
      null,
    finish:
      computed?.earlyFinish ??
      activity.sourceDates?.early.finish ??
      activity.sourceDates?.planned.finish ??
      null,
  };
}

/**
 * The one progress helper every % complete edit goes through (P4 core D13): it keeps the status and
 * actual dates consistent with the new percent. Leaving 0 % fills an empty actual start from the
 * shown start; 100 % also fills an empty actual finish from the shown finish; neither is ever after
 * the status date. Below 100 % clears the actual finish, back to 0 % clears both, and existing actual
 * dates are kept. `percentComplete` must already be checked to be 0–100.
 */
export function progressChanges(
  activity: ScheduleActivity,
  percentComplete: number,
  dates: ProgressDates,
  statusDate: WallClock | null,
): ProgressChanges {
  const pct = Math.round(percentComplete * 10) / 10;
  const after = (a: WallClock, b: WallClock) =>
    (wallClockToCivilMinutes(a) ?? Number.NEGATIVE_INFINITY) >
    (wallClockToCivilMinutes(b) ?? Number.POSITIVE_INFINITY);
  const cap = (wc: WallClock) => (statusDate !== null && after(wc, statusDate) ? statusDate : wc);
  const status: ScheduleActivity['status'] =
    pct <= 0 ? 'not_started' : pct >= 100 ? 'completed' : 'in_progress';
  const base = {
    status,
    remainingDuration: Math.round(activity.originalDuration * (1 - pct / 100)),
    percent: { ...activity.percent, duration: pct, physical: pct },
  };
  if (status === 'not_started') return { ...base, actualStart: null, actualFinish: null };
  const actualStart = activity.actualStart ?? (dates.start === null ? null : cap(dates.start));
  if (status === 'in_progress') return { ...base, actualStart, actualFinish: null };
  let actualFinish = activity.actualFinish;
  if (actualFinish === null && dates.finish !== null) {
    actualFinish = cap(dates.finish);
    if (actualStart !== null && after(actualStart, actualFinish)) actualFinish = actualStart;
  }
  return { ...base, actualStart, actualFinish };
}
