import { describe, expect, it } from 'vitest';
import {
  excelSerialToWallClock,
  guessDateFormat,
  isExcelSerialInRange,
  parseMspdiDate,
  parseTableDate,
  parseXerDate,
} from '@/import/dates';

describe('dates', () => {
  it('reads XER and MSPDI timestamps as wall-clock text', () => {
    expect(
      ['2026-3-5 8:00', '2026-03-05', '2026-03-05 17', '2026-03-05 08:30:15'].map(parseXerDate),
    ).toEqual(['2026-03-05T08:00', '2026-03-05T00:00', '2026-03-05T17:00', '2026-03-05T08:30']);
    expect(parseXerDate('')).toBeNull();
    expect(parseXerDate('2026-02-30 08:00')).toBe('invalid');
    expect(parseMspdiDate('2026-03-05T08:00:00')).toBe('2026-03-05T08:00');
    expect(parseMspdiDate('05/03/2026')).toBe('invalid');
  });

  it('reads table dates with weekdays, month names, two-digit years and times', () => {
    expect(parseTableDate('15.03.2026', 'DD.MM.YYYY')).toEqual({ date: '2026-03-15', time: null });
    expect(parseTableDate('5/3/26', 'DD/MM/YYYY')).toEqual({ date: '2026-03-05', time: null });
    expect(parseTableDate('3/16/26 8:00 AM', 'MM/DD/YYYY')).toEqual({
      date: '2026-03-16',
      time: '08:00',
    });
    expect(parseTableDate('Mon 3/16/26 5:00 PM', 'MM/DD/YYYY')).toEqual({
      date: '2026-03-16',
      time: '17:00',
    });
    expect(parseTableDate('Pazartesi 16.03.2026 08:00', 'DD.MM.YYYY')).toEqual({
      date: '2026-03-16',
      time: '08:00',
    });
    expect(parseTableDate('15 Mart 2026', 'DD.MM.YYYY')).toEqual({
      date: '2026-03-15',
      time: null,
    });
    expect(parseTableDate('15 Şub 2026', 'DD.MM.YYYY')).toEqual({ date: '2026-02-15', time: null });
    expect(parseTableDate('March 15, 2026', 'MM/DD/YYYY')).toEqual({
      date: '2026-03-15',
      time: null,
    });
    expect(parseTableDate('2026-03-15', 'YYYY-MM-DD')).toEqual({ date: '2026-03-15', time: null });
    expect(parseTableDate('31.02.2026', 'DD.MM.YYYY')).toBe('invalid');
    expect(parseTableDate('', 'DD.MM.YYYY')).toBeNull();
  });

  it('converts Excel serials in both date systems', () => {
    expect(excelSerialToWallClock(46096, false)).toBe('2026-03-15T00:00');
    expect(excelSerialToWallClock(46096.5, false)).toBe('2026-03-15T12:00');
    expect(excelSerialToWallClock(44634, true)).toBe('2026-03-15T00:00');
    expect(excelSerialToWallClock(59, false)).toBe('1900-02-28T00:00');
    expect(excelSerialToWallClock(61, false)).toBe('1900-03-01T00:00');
  });

  it('guesses the date format that reads every sample', () => {
    expect(guessDateFormat(['15.03.2026', '1.4.2026'])).toBe('DD.MM.YYYY');
    expect(guessDateFormat(['Mon 3/16/26 8:00 AM', '3/2/26'])).toBe('MM/DD/YYYY');
    expect(guessDateFormat(['15/03/2026'])).toBe('DD/MM/YYYY');
    expect(guessDateFormat(['2026-03-15'])).toBe('YYYY-MM-DD');
    expect(guessDateFormat(['soon'])).toBe('DD.MM.YYYY');
  });

  it('accepts a two-digit year only where the year comes last (D49)', () => {
    expect(parseTableDate('15-Mar-26', 'YYYY-MM-DD')).toBe('invalid');
    expect(parseTableDate('15-Mar-26 08:00', 'YYYY-MM-DD')).toBe('invalid');
    expect(parseTableDate('15-03-26', 'YYYY-MM-DD')).toBe('invalid');
    expect(parseTableDate('26-03-15', 'YYYY-MM-DD')).toBe('invalid');
    expect(parseTableDate('2026-03-15 08:00', 'YYYY-MM-DD')).toEqual({
      date: '2026-03-15',
      time: '08:00',
    });

    const samples = ['15-Mar-26', '01-Apr-26', '30-Jun-26'];
    const format = guessDateFormat(samples);
    expect(format).toBe('DD.MM.YYYY');
    expect(samples.map((sample) => parseTableDate(sample, format))).toEqual([
      { date: '2026-03-15', time: null },
      { date: '2026-04-01', time: null },
      { date: '2026-06-30', time: null },
    ]);
    expect(guessDateFormat(['15-Mar-26 08:00'])).toBe('DD.MM.YYYY');
    expect(parseTableDate('15-Mar-26 08:00', 'DD.MM.YYYY')).toEqual({
      date: '2026-03-15',
      time: '08:00',
    });
  });

  it('accepts in an all-number date a separator no other format with the same order uses', () => {
    expect(parseTableDate('15-03-2026', 'DD.MM.YYYY')).toEqual({ date: '2026-03-15', time: null });
    expect(parseTableDate('15-03-2026', 'DD/MM/YYYY')).toEqual({ date: '2026-03-15', time: null });
    expect(parseTableDate('15-03-26', 'DD.MM.YYYY')).toEqual({ date: '2026-03-15', time: null });
    expect(parseTableDate('2026/03/15', 'YYYY-MM-DD')).toEqual({ date: '2026-03-15', time: null });
    expect(parseTableDate('2026.03.15', 'YYYY-MM-DD')).toEqual({ date: '2026-03-15', time: null });
    // Each day-first format still refuses the other one's own separator.
    expect(parseTableDate('15/03/2026', 'DD.MM.YYYY')).toBe('invalid');
    expect(parseTableDate('15.03.2026', 'DD/MM/YYYY')).toBe('invalid');
    // Mixed separators are refused.
    expect(parseTableDate('15.03-2026', 'DD.MM.YYYY')).toBe('invalid');
    expect(parseTableDate('2026/03-15', 'YYYY-MM-DD')).toBe('invalid');

    expect(guessDateFormat(['15-03-2026', '1-4-2026'])).toBe('DD.MM.YYYY');
    expect(guessDateFormat(['2026/03/15'])).toBe('YYYY-MM-DD');
    expect(guessDateFormat(['15/03/2026'])).toBe('DD/MM/YYYY');
  });

  it('reads a cell with a long run of spaces quickly', () => {
    const spaces = ' '.repeat(100_000);
    const started = performance.now();
    expect(parseTableDate(`15.03.2026${spaces}x`, 'DD.MM.YYYY')).toBe('invalid');
    expect(parseTableDate(`15.03.2026${spaces}08:00`, 'DD.MM.YYYY')).toEqual({
      date: '2026-03-15',
      time: '08:00',
    });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('tells which Excel serials fall in 1900 to 9999', () => {
    expect(isExcelSerialInRange(46096, false)).toBe(true);
    expect(isExcelSerialInRange(46096.5, false)).toBe(true);
    expect(isExcelSerialInRange(1, false)).toBe(true);
    expect(excelSerialToWallClock(1, false)).toBe('1900-01-01T00:00');
    expect(isExcelSerialInRange(0, false)).toBe(false);
    expect(isExcelSerialInRange(-1, false)).toBe(false);
    expect(isExcelSerialInRange(2958465, false)).toBe(true);
    expect(excelSerialToWallClock(2958465, false)).toBe('9999-12-31T00:00');
    expect(isExcelSerialInRange(2958465.9999999, false)).toBe(false);
    expect(isExcelSerialInRange(2958466, false)).toBe(false);
    expect(isExcelSerialInRange(3e6, false)).toBe(false);
    expect(isExcelSerialInRange(0, true)).toBe(true);
    expect(excelSerialToWallClock(0, true)).toBe('1904-01-01T00:00');
    expect(isExcelSerialInRange(-1, true)).toBe(false);
    expect(isExcelSerialInRange(2957003, true)).toBe(true);
    expect(excelSerialToWallClock(2957003, true)).toBe('9999-12-31T00:00');
    expect(isExcelSerialInRange(2957004, true)).toBe(false);
    for (const serial of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1e300,
      Number.MAX_VALUE,
    ]) {
      expect(isExcelSerialInRange(serial, false)).toBe(false);
      expect(isExcelSerialInRange(serial, true)).toBe(false);
    }
  });
});
