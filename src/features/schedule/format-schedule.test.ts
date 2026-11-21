import { describe, expect, it } from 'vitest';
import {
  formatScheduleDate,
  formatScheduleDateTime,
  formatWorkingDays,
} from '@/features/schedule/format-schedule';

describe('schedule formatters (D6)', () => {
  it('formats wall-clock timestamps as DD.MM.YYYY and DD.MM.YYYY · HH:mm with — for null', () => {
    expect(formatScheduleDate('2026-10-15T08:00')).toBe('15.10.2026');
    expect(formatScheduleDate('2026-01-05')).toBe('05.01.2026');
    expect(formatScheduleDate(null)).toBe('—');

    expect(formatScheduleDateTime('2026-10-15T08:00')).toBe('15.10.2026 · 08:00');
    expect(formatScheduleDateTime('2026-10-15')).toBe('15.10.2026');
    expect(formatScheduleDateTime(null)).toBe('—');
  });

  it('formats working days using calendar hoursPerDay with optional sign and stripped .0', () => {
    expect(formatWorkingDays(2400, 8)).toBe('5 d');
    expect(formatWorkingDays(1200, 8)).toBe('2.5 d');
    expect(formatWorkingDays(0, 8)).toBe('0 d');
    expect(formatWorkingDays(null, 8)).toBe('—');

    expect(formatWorkingDays(5760, 8, { signed: true })).toBe('+12 d');
    expect(formatWorkingDays(0, 8, { signed: true })).toBe('0 d');
    expect(formatWorkingDays(-1440, 8, { signed: true })).toBe('-3 d');

    // Non-8h calendar (10 h/day = 600 min/day)
    expect(formatWorkingDays(1500, 10)).toBe('2.5 d');
    expect(formatWorkingDays(600, 10, { signed: true })).toBe('+1 d');
  });
});
