import { describe, expect, it } from 'vitest';
import { parseDuration } from '@/import/durations';

const days = { unit: 'days', hoursPerDay: 8, decimal: '.' } as const;
const minutes = (text: string, options: Parameters<typeof parseDuration>[1] = days) => {
  const result = parseDuration(text, options);
  return result.kind === 'ok' ? result.minutes : result.kind;
};

describe('durations', () => {
  it('reads English and Turkish units, bare numbers in the chosen unit and hours per day', () => {
    expect(
      [
        '5 days',
        '2 hrs',
        '30m',
        '1 wk',
        '1 mo',
        '3 gün',
        '2 saat',
        '1 hafta',
        '1 ay',
        '45 dk',
        '4',
      ].map((t) => minutes(t)),
    ).toEqual([2400, 120, 30, 2400, 9600, 1440, 120, 2400, 9600, 45, 1920]);
    expect(minutes('2,5 g', { ...days, decimal: ',' })).toBe(1200);
    expect(minutes('4', { ...days, unit: 'hours' })).toBe(240);
    expect(minutes('3 d', { ...days, hoursPerDay: 10 })).toBe(1800);
  });

  it('marks estimates and elapsed time, and refuses the rest', () => {
    expect(parseDuration('5 days?', days)).toEqual({
      kind: 'ok',
      minutes: 2400,
      elapsed: false,
      estimated: true,
    });
    expect(parseDuration('2 edays', days)).toEqual({
      kind: 'ok',
      minutes: 2880,
      elapsed: true,
      estimated: false,
    });
    expect(parseDuration('3 egün', days)).toEqual({
      kind: 'ok',
      minutes: 4320,
      elapsed: true,
      estimated: false,
    });
    expect(parseDuration('', days)).toEqual({ kind: 'empty' });
    expect(parseDuration('soon', days)).toEqual({ kind: 'invalid' });
  });

  it('reads the longer minute spellings and the dy and dys day units, elapsed too (D50)', () => {
    expect(['30 mins', '1 minute', '45 minutes', '5 dys', '1 dy'].map((t) => minutes(t))).toEqual([
      30, 1, 45, 2400, 480,
    ]);
    expect(parseDuration('30 emins', days)).toEqual({
      kind: 'ok',
      minutes: 30,
      elapsed: true,
      estimated: false,
    });
    expect(parseDuration('2 edys', days)).toEqual({
      kind: 'ok',
      minutes: 2880,
      elapsed: true,
      estimated: false,
    });
  });
});
