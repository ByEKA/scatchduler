// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createTimescale, PX_PER_DAY } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, MINUTES_PER_DAY } from '@/lib/civil-date';

describe('Gantt timescale', () => {
  it('round-trips x and minuteAt exactly across all 4 zoom levels', () => {
    const origin = civilDaysFromYmd(2026, 1, 1) * MINUTES_PER_DAY;
    for (const zoom of ['day', 'week', 'month', 'quarter'] as const) {
      const ts = createTimescale(zoom, origin);
      expect(ts.pxPerDay).toBe(PX_PER_DAY[zoom]);
      const sample = civilDaysFromYmd(2026, 3, 15) * MINUTES_PER_DAY + 8 * 60;
      const x = ts.x(sample);
      expect(ts.minuteAt(x)).toBeCloseTo(sample, 6);
    }
  });

  it('produces exact two-tier header cells across leap-year February and year rollover', () => {
    // Leap year 2024 Feb 26 .. Mar 4
    const leapOrigin = civilDaysFromYmd(2024, 2, 26) * MINUTES_PER_DAY;
    const dayTs = createTimescale('day', leapOrigin);
    const [dayTop, dayBottom] = dayTs.tiers(0, 7 * PX_PER_DAY.day);
    expect(dayTop.map((c) => c.label)).toEqual(['Feb 2024', 'Mar 2024']);
    expect(dayBottom.map((c) => c.label)).toEqual(['26', '27', '28', '29', '01', '02', '03']);

    // Week zoom around Jan 2026
    const weekOrigin = civilDaysFromYmd(2025, 12, 29) * MINUTES_PER_DAY;
    const weekTs = createTimescale('week', weekOrigin);
    const [weekTop, weekBottom] = weekTs.tiers(0, 21 * PX_PER_DAY.week);
    expect(weekTop.map((c) => c.label)).toEqual(['Dec 2025', 'Jan 2026']);
    expect(weekBottom.map((c) => c.label)).toContain('W01');
    expect(weekBottom.map((c) => c.label)).toContain('W02');

    // Month zoom across year boundary Dec 2025 -> Feb 2026
    const monthOrigin = civilDaysFromYmd(2025, 12, 1) * MINUTES_PER_DAY;
    const monthTs = createTimescale('month', monthOrigin);
    const [monthTop, monthBottom] = monthTs.tiers(0, 90 * PX_PER_DAY.month);
    expect(monthTop.map((c) => c.label)).toEqual(['2025', '2026']);
    expect(monthBottom.map((c) => c.label)).toEqual(['Dec', 'Jan', 'Feb']);

    // Quarter zoom across full year 2026
    const qOrigin = civilDaysFromYmd(2026, 1, 1) * MINUTES_PER_DAY;
    const qTs = createTimescale('quarter', qOrigin);
    const [qTop, qBottom] = qTs.tiers(0, 365 * PX_PER_DAY.quarter);
    expect(qTop.map((c) => c.label)).toEqual(['2026']);
    expect(qBottom.map((c) => c.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });
});
