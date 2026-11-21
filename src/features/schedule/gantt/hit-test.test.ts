// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeZoomToFit, hitTestBar } from '@/features/schedule/gantt/hit-test';
import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import { createTimescale } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, MINUTES_PER_DAY } from '@/lib/civil-date';

const origin = civilDaysFromYmd(2026, 1, 5) * MINUTES_PER_DAY;

describe('Gantt hit-test and zoom-to-fit', () => {
  const rows: GanttRow[] = [
    {
      key: 'act:a1',
      kind: 'activity',
      activityType: 'task',
      start: origin + 2 * MINUTES_PER_DAY,
      finish: origin + 7 * MINUTES_PER_DAY,
      progressFinish: null,
      isCritical: false,
      isNearCritical: false,
      label: 'Excavation',
    },
    {
      key: 'act:m1',
      kind: 'activity',
      activityType: 'finish_milestone',
      start: origin + 7 * MINUTES_PER_DAY,
      finish: origin + 7 * MINUTES_PER_DAY,
      progressFinish: null,
      isCritical: true,
      isNearCritical: false,
      label: 'Handover',
    },
  ];

  it('hits task bars, hits milestone diamonds within 6 px tolerance, and returns null on misses', () => {
    const ts = createTimescale('day', origin);
    // Task bar spans day 2..7 -> x = 64..224, row 0 y = 0..32
    expect(hitTestBar(120, 16, rows, ts, 0, 0)?.key).toBe('act:a1');
    expect(hitTestBar(10, 16, rows, ts, 0, 0)).toBeNull();
    expect(hitTestBar(300, 16, rows, ts, 0, 0)).toBeNull();

    // Milestone centered at x = 224, row 1 y = 48 (diamond radius 6 + 6 px tolerance)
    expect(hitTestBar(224, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0)?.key).toBe('act:m1');
    expect(hitTestBar(224 + 9, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0)?.key).toBe('act:m1');
    expect(hitTestBar(224 + 25, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0)).toBeNull();

    // With scroll offset applied
    expect(hitTestBar(70, 16, rows, ts, 50, 0)?.key).toBe('act:a1');
    expect(hitTestBar(120, 100, rows, ts, 0, 0)).toBeNull();
  });

  it('computes zoom-to-fit covering the full schedule span with padding', () => {
    // 5-day span on 640 px viewport -> fits comfortably in 'day' zoom (32 px/day)
    const shortFit = computeZoomToFit(rows, 640);
    expect(shortFit.zoom).toBe('day');
    expect(shortFit.originMinute).toBeLessThan(rows[0]!.start!);
    expect(shortFit.scrollLeft).toBe(0);

    // 2-year span on 640 px viewport -> picks 'quarter' zoom (1 px/day)
    const longRows: GanttRow[] = [
      { ...rows[0]!, start: origin, finish: origin + 500 * MINUTES_PER_DAY },
    ];
    const longFit = computeZoomToFit(longRows, 640);
    expect(longFit.zoom).toBe('quarter');
    const longTs = createTimescale(longFit.zoom, longFit.originMinute);
    expect(longTs.x(longRows[0]!.finish!)).toBeLessThanOrEqual(640);
  });
});
