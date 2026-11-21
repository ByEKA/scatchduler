import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  civilDaysFromYmd,
  dayOfWeek,
  isoDateFromMinutes,
  MINUTES_PER_DAY,
  startOfCivilDay,
  toMinutes,
  toWallClock,
  ymdFromCivilDays,
} from '@/engine/time';

describe('time', () => {
  it('round-trips epoch, leap days and DST transition dates with zero zone drift', () => {
    const cases: Array<[string, number, number]> = [
      ['1970-01-01T00:00', 0, 4],
      ['2024-02-29T12:30', 28486830, 4],
      ['2026-01-05T08:00', 29460000, 1],
      ['2026-03-08T02:30', 29548950, 0], // US spring-forward gap stays intact as wall-clock
      ['2026-11-01T01:30', 29891610, 0], // US fall-back hour
    ];
    for (const [wc, expectedMin, dow] of cases) {
      expect(toMinutes(wc)).toBe(expectedMin);
      expect(toWallClock(expectedMin)).toBe(wc);
      expect(dayOfWeek(expectedMin)).toBe(dow);
    }
    expect(isoDateFromMinutes(toMinutes('2026-01-05T17:00'))).toBe('2026-01-05');
    expect(startOfCivilDay(toMinutes('2026-01-05T17:00'))).toBe(toMinutes('2026-01-05T00:00'));
    expect(MINUTES_PER_DAY).toBe(1440);
  });

  it('handles pre-1970 dates and century leap-year boundaries', () => {
    expect(civilDaysFromYmd(1969, 12, 31)).toBe(-1);
    expect(ymdFromCivilDays(-1)).toEqual({ year: 1969, month: 12, day: 31 });
    expect(toWallClock(-60)).toBe('1969-12-31T23:00');
    expect(toMinutes('1969-12-31T23:00')).toBe(-60);
    expect(dayOfWeek(-60)).toBe(3); // Wednesday
    expect(startOfCivilDay(-60)).toBe(-1440);
    // 2000 is a leap year; 2100 is not
    expect(civilDaysFromYmd(2000, 3, 1) - civilDaysFromYmd(2000, 2, 28)).toBe(2);
    expect(civilDaysFromYmd(2100, 3, 1) - civilDaysFromYmd(2100, 2, 28)).toBe(1);
  });

  it('satisfies round-trip property across 1970..2099', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 68_371_200 }), (min) => {
        expect(toMinutes(toWallClock(min))).toBe(min);
      }),
    );
  });
});
