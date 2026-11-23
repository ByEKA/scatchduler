// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  computeZoomToFit,
  hitTestBar,
  hitTestGanttTarget,
} from '@/features/schedule/gantt/hit-test';
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
      progressFinish: origin + 4 * MINUTES_PER_DAY,
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
    {
      key: 'wbs:w1',
      kind: 'wbs',
      activityType: null,
      start: origin + 2 * MINUTES_PER_DAY,
      finish: origin + 7 * MINUTES_PER_DAY,
      progressFinish: null,
      isCritical: false,
      isNearCritical: false,
      label: 'Substructure',
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
    expect(hitTestBar(120, 150, rows, ts, 0, 0)).toBeNull();
  });

  it('distinguishes link ports, resize, progress and move in Edit mode while keeping View mode and WBS rows select-only', () => {
    const ts = createTimescale('day', origin);
    // Task bar a1: x1 = 64, x2 = 224, progressX = 128, row 0 centerY = 16, barBottom = 24
    // View mode returns bar-select only
    expect(hitTestGanttTarget(222, 16, rows, ts, 0, 0, false)?.kind).toBe('bar-select');
    expect(hitTestGanttTarget(56, 16, rows, ts, 0, 0, false)).toBeNull();

    // Edit mode on task bar:
    // Start connector port at x = 64 - 8 = 56, y = 16
    expect(hitTestGanttTarget(56, 16, rows, ts, 0, 0, true)).toMatchObject({
      kind: 'link-port-start',
      rowIndex: 0,
    });
    // Finish connector port at x = 224 + 8 = 232, y = 16
    expect(hitTestGanttTarget(232, 16, rows, ts, 0, 0, true)).toMatchObject({
      kind: 'link-port-finish',
      rowIndex: 0,
    });
    // Resize handle near x2 = 224
    expect(hitTestGanttTarget(222, 16, rows, ts, 0, 0, true)?.kind).toBe('bar-resize');
    // Progress handle near progressX = 128 at lower band y = 22
    expect(hitTestGanttTarget(128, 22, rows, ts, 0, 0, true)?.kind).toBe('bar-progress');
    // Interior bar body -> bar-move
    expect(hitTestGanttTarget(160, 14, rows, ts, 0, 0, true)?.kind).toBe('bar-move');

    // Milestone row 1 (cx = 224, centerY = 48): start port at 224 - 6 - 8 = 210, finish port at 224 + 6 + 8 = 238
    expect(hitTestGanttTarget(210, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0, true)?.kind).toBe(
      'link-port-start',
    );
    expect(hitTestGanttTarget(238, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0, true)?.kind).toBe(
      'link-port-finish',
    );
    expect(hitTestGanttTarget(224, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0, true)?.kind).toBe(
      'bar-move',
    );

    // WBS row 2 never returns editable drag targets even in Edit mode
    expect(hitTestGanttTarget(160, GANTT_ROW_HEIGHT * 2 + 16, rows, ts, 0, 0, true)?.kind).toBe(
      'bar-select',
    );
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
