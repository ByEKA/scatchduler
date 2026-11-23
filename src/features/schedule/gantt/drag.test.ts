// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  commitGanttDrag,
  mapPortsToRelationshipType,
  startGanttDrag,
  updateGanttDrag,
} from '@/features/schedule/gantt/drag';
import { hitTestGanttTarget } from '@/features/schedule/gantt/hit-test';
import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import { createTimescale } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, MINUTES_PER_DAY } from '@/lib/civil-date';

const origin = civilDaysFromYmd(2026, 1, 5) * MINUTES_PER_DAY;

const rows: GanttRow[] = [
  {
    key: 'act:a1',
    kind: 'activity',
    activityType: 'task',
    start: origin + 2 * MINUTES_PER_DAY, // 2026-01-07 (x1 = 64)
    finish: origin + 7 * MINUTES_PER_DAY, // 2026-01-12 (x2 = 224)
    progressFinish: origin + 4 * MINUTES_PER_DAY, // progressX = 128
    isCritical: false,
    isNearCritical: false,
    label: 'Excavation',
  },
  {
    key: 'act:a2',
    kind: 'activity',
    activityType: 'task',
    start: origin + 7 * MINUTES_PER_DAY, // x1 = 224
    finish: origin + 10 * MINUTES_PER_DAY, // x2 = 320
    progressFinish: null,
    isCritical: true,
    isNearCritical: false,
    label: 'Foundation',
  },
];

describe('Gantt drag state machine', () => {
  const ts = createTimescale('day', origin); // 32 px/day

  it('snaps bar-move to whole working days and commits an SNET constraint', () => {
    const hit = hitTestGanttTarget(160, 14, rows, ts, 0, 0, true)!;
    expect(hit.kind).toBe('bar-move');
    const started = startGanttDrag(hit, 160, 14, { hoursPerDay: 8 })!;
    // Move right by 3 days (3 * 32 = 96 px -> 256)
    const moved = updateGanttDrag(started, 256, 14, rows, ts, 0, 0);
    expect(moved.overlay).toMatchObject({
      kind: 'bar-ghost',
      mode: 'bar-move',
      badgeLabel: '10.01.2026',
    });
    expect(commitGanttDrag(moved)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: {
        constraint: {
          type: 'start_on_or_after',
          date: '2026-01-10T08:00',
        },
      },
    });
  });

  it('snaps bar-resize to working days (min 1 day) and commits originalDuration and remainingDuration', () => {
    const hit = hitTestGanttTarget(222, 16, rows, ts, 0, 0, true)!;
    expect(hit.kind).toBe('bar-resize');
    const started = startGanttDrag(hit, 222, 16, { hoursPerDay: 8 })!;
    // Extend right edge by 2 days (x = 224 + 64 = 288 -> 7 days total = 3360 minutes)
    const resized = updateGanttDrag(started, 288, 16, rows, ts, 0, 0);
    expect(resized.overlay).toMatchObject({
      kind: 'bar-ghost',
      mode: 'bar-resize',
      badgeLabel: '7 d',
    });
    expect(commitGanttDrag(resized)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: {
        originalDuration: 7 * 8 * 60,
        remainingDuration: 7 * 8 * 60,
      },
    });

    // Shrinking past start clamps to 1 working day (480 minutes)
    const clamped = updateGanttDrag(started, 10, 16, rows, ts, 0, 0);
    expect(clamped.overlay).toMatchObject({ badgeLabel: '1 d' });
    expect(commitGanttDrag(clamped)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: {
        originalDuration: 480,
        remainingDuration: 480,
      },
    });
  });

  it('clamps bar-progress between 0 and 100% and commits percent and status', () => {
    const hit = hitTestGanttTarget(128, 22, rows, ts, 0, 0, true)!;
    expect(hit.kind).toBe('bar-progress');
    const started = startGanttDrag(hit, 128, 22)!;
    // Bar spans x = 64..224 (width 160); drag to x = 144 -> 50%
    const half = updateGanttDrag(started, 144, 22, rows, ts, 0, 0);
    expect(half.overlay).toMatchObject({
      kind: 'bar-ghost',
      mode: 'bar-progress',
      badgeLabel: '50%',
    });
    expect(commitGanttDrag(half)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: {
        percent: { duration: 50, physical: 50, type: 'duration' },
        status: 'in_progress',
      },
    });

    // Drag past right edge -> 100% completed
    const full = updateGanttDrag(started, 300, 22, rows, ts, 0, 0);
    expect(commitGanttDrag(full)).toMatchObject({
      changes: {
        percent: { duration: 100, physical: 100, type: 'duration' },
        status: 'completed',
      },
    });
  });

  it('maps port pairs to FS/SS/FF/SF and commits addRelationship when dropped on another activity', () => {
    expect(mapPortsToRelationshipType('finish', 'start')).toBe('FS');
    expect(mapPortsToRelationshipType('start', 'start')).toBe('SS');
    expect(mapPortsToRelationshipType('finish', 'finish')).toBe('FF');
    expect(mapPortsToRelationshipType('start', 'finish')).toBe('SF');

    // Start from a1 finish port (x = 232, y = 16)
    const hit = hitTestGanttTarget(232, 16, rows, ts, 0, 0, true)!;
    expect(hit.kind).toBe('link-port-finish');
    const started = startGanttDrag(hit, 232, 16)!;

    // Hover over a2 start port (x = 224 - 8 = 216, y = 32 + 16 = 48) -> FS
    const overTarget = updateGanttDrag(started, 216, GANTT_ROW_HEIGHT + 16, rows, ts, 0, 0);
    expect(overTarget.overlay).toMatchObject({
      kind: 'link-draw',
      targetRowIndex: 1,
      targetPort: 'start',
      relType: 'FS',
    });
    expect(commitGanttDrag(overTarget)).toEqual({
      type: 'addRelationship',
      predecessorId: 'a1',
      successorId: 'a2',
      relType: 'FS',
      lagMinutes: 0,
      lagElapsed: false,
    });

    // Dropping on empty space or self returns null
    const overEmpty = updateGanttDrag(started, 500, 200, rows, ts, 0, 0);
    expect(commitGanttDrag(overEmpty)).toBeNull();
  });
});
