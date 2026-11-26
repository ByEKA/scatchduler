import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  addWorkingMinutes,
  compileCalendar,
  ELAPSED_CALENDAR,
  isNonWorkingDay,
  snapBackwardToWorkFinish,
  snapForwardToWorkStart,
  subtractWorkingMinutes,
  workingMinutesBetween,
} from '@/engine/calendar';
import { makeStandardCalendar } from '@/engine/testing';
import { toMinutes, toWallClock } from '@/engine/time';

function mustCompile(cal = makeStandardCalendar('cal:std')) {
  const compiled = compileCalendar(cal);
  if ('code' in compiled) throw new Error(compiled.message);
  return compiled;
}

describe('calendar', () => {
  it('handles work-block boundaries, lunch breaks, weekends and holiday exceptions', () => {
    const cal = mustCompile(
      makeStandardCalendar('cal:std', {
        exceptions: [
          { date: '2026-01-07', periods: [] }, // Wed holiday
          { date: '2026-01-10', periods: [{ start: 480, finish: 720 }] }, // Sat half-day 4h
        ],
      }),
    );
    // 1 day (480 min) ends at 17:00 same day, never next morning 08:00
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-05T08:00'), 480))).toBe(
      '2026-01-05T17:00',
    );
    // 4 h ends at 12:00; 5 h crosses lunch to 14:00
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-05T08:00'), 240))).toBe(
      '2026-01-05T12:00',
    );
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-05T08:00'), 300))).toBe(
      '2026-01-05T14:00',
    );
    // Skips Wed holiday (Jan 7)
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-06T08:00'), 960))).toBe(
      '2026-01-08T17:00',
    );
    // Uses Sat half-day (4h) + Mon 4h for 1 day from Fri 17:00
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-09T17:00'), 480))).toBe(
      '2026-01-12T12:00',
    );
    // Negative minutes delegate to inverse direction
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-08T17:00'), -960))).toBe(
      '2026-01-06T08:00',
    );
    expect(toWallClock(subtractWorkingMinutes(cal, toMinutes('2026-01-06T08:00'), -960))).toBe(
      '2026-01-08T17:00',
    );
    // Snaps across weekend
    expect(toWallClock(snapForwardToWorkStart(cal, toMinutes('2026-01-11T10:00')))).toBe(
      '2026-01-12T08:00',
    );
    expect(toWallClock(snapBackwardToWorkFinish(cal, toMinutes('2026-01-11T10:00')))).toBe(
      '2026-01-10T12:00',
    );
    // Non-working day checks (holiday, Sat working exception, Sun weekend, Mon working)
    expect(isNonWorkingDay(cal, toMinutes('2026-01-07T00:00'))).toBe(true);
    expect(isNonWorkingDay(cal, toMinutes('2026-01-10T00:00'))).toBe(false);
    expect(isNonWorkingDay(cal, toMinutes('2026-01-11T00:00'))).toBe(true);
    expect(isNonWorkingDay(cal, toMinutes('2026-01-12T00:00'))).toBe(false);
    // Signed workingMinutesBetween
    expect(
      workingMinutesBetween(cal, toMinutes('2026-01-05T08:00'), toMinutes('2026-01-06T17:00')),
    ).toBe(960);
    expect(
      workingMinutesBetween(cal, toMinutes('2026-01-06T17:00'), toMinutes('2026-01-05T08:00')),
    ).toBe(-960);
  });

  it('supports elapsed 24h calendar and rejects zero-working-hour calendars', () => {
    expect(
      toWallClock(addWorkingMinutes(ELAPSED_CALENDAR, toMinutes('2026-01-09T17:00'), 1440)),
    ).toBe('2026-01-10T17:00');
    expect(isNonWorkingDay(ELAPSED_CALENDAR, toMinutes('2026-01-11T00:00'))).toBe(false);
    const empty = compileCalendar(
      makeStandardCalendar('cal:empty', {
        name: 'Blank Cal',
        week: [[], [], [], [], [], [], []],
        exceptions: [],
      }),
    );
    expect(empty).toEqual({
      code: 'CALENDAR_NO_WORKING_TIME',
      calendarId: 'cal:empty',
      message: "Calendar Blank Cal has no working hours. Dates can't be calculated.",
    });
  });

  it('handles calendars with working exceptions only without hanging or returning NaN', () => {
    const cal = mustCompile(
      makeStandardCalendar('cal:ex-only', {
        name: 'Exceptions Only',
        week: [[], [], [], [], [], [], []],
        exceptions: [
          { date: '2026-01-10', periods: [{ start: 480, finish: 720 }] },
          { date: '2026-01-15', periods: [{ start: 480, finish: 960 }] },
        ],
      }),
    );
    expect(toWallClock(snapForwardToWorkStart(cal, toMinutes('2026-01-05T08:00')))).toBe(
      '2026-01-10T08:00',
    );
    expect(toWallClock(addWorkingMinutes(cal, toMinutes('2026-01-10T08:00'), 480))).toBe(
      '2026-01-15T12:00',
    );
    expect(toWallClock(subtractWorkingMinutes(cal, toMinutes('2026-01-15T12:00'), 480))).toBe(
      '2026-01-10T08:00',
    );
    expect(
      workingMinutesBetween(cal, toMinutes('2026-01-10T08:00'), toMinutes('2026-01-15T16:00')),
    ).toBe(720);
    // Asking beyond available working exceptions finishes deterministically without NaN
    const pastEnd = addWorkingMinutes(cal, toMinutes('2026-01-10T08:00'), 10_000);
    expect(Number.isFinite(pastEnd)).toBe(true);
    expect(toWallClock(pastEnd)).toBe('2026-01-15T16:00');
    const beforeStart = subtractWorkingMinutes(cal, toMinutes('2026-01-15T16:00'), 10_000);
    expect(Number.isFinite(beforeStart)).toBe(true);
    expect(toWallClock(beforeStart)).toBe('2026-01-10T08:00');
  });

  it('expands its lazy day table automatically across decades', () => {
    const cal = mustCompile();
    const start = toMinutes('2026-01-05T08:00');
    // Add 30 years of 5-day work weeks (30 * 260 * 480 = 3,744,000 working minutes)
    const future = addWorkingMinutes(cal, start, 3_744_000);
    expect(subtractWorkingMinutes(cal, future, 3_744_000)).toBe(start);
    expect(workingMinutesBetween(cal, start, future)).toBe(3_744_000);
    // And backwards across decades (positive add lands on Friday 17:00 finish, snapping forward to Monday 08:00)
    const past = subtractWorkingMinutes(cal, start, 3_744_000);
    const backFinish = addWorkingMinutes(cal, past, 3_744_000);
    expect(toWallClock(backFinish)).toBe('2026-01-02T17:00');
    expect(snapForwardToWorkStart(cal, backFinish)).toBe(start);
    expect(workingMinutesBetween(cal, past, start)).toBe(3_744_000);
    // Starting from a work finish round-trips identically
    const finish = toMinutes('2026-01-05T17:00');
    const pastFromFinish = subtractWorkingMinutes(cal, finish, 3_744_000);
    expect(addWorkingMinutes(cal, pastFromFinish, 3_744_000)).toBe(finish);
  });

  it('satisfies add/subtract inverse property via fast-check', () => {
    const cal = mustCompile();
    const base = toMinutes('2026-01-05T08:00');
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 30_000 }),
        fc.integer({ min: 1, max: 20_000 }),
        (offset, dur) => {
          const start = snapForwardToWorkStart(cal, base + offset);
          const finish = addWorkingMinutes(cal, start, dur);
          expect(subtractWorkingMinutes(cal, finish, dur)).toBe(start);
          expect(workingMinutesBetween(cal, start, finish)).toBe(dur);
        },
      ),
    );
  });
});
