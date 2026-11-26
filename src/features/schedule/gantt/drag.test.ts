// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ScheduleCalendar, WallClock } from '@/data/schedule-types';
import { solve } from '@/engine';
import { makeActivity, makeDocument, makeStandardCalendar } from '@/engine/testing';
import {
  commitGanttDrag,
  mapPortsToRelationshipType,
  startGanttDrag,
  updateGanttDrag,
  type GanttDragState,
} from '@/features/schedule/gantt/drag';
import { hitTestGanttTarget } from '@/features/schedule/gantt/hit-test';
import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import { createTimescale, type Timescale } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, MINUTES_PER_DAY, wallClockToCivilMinutes } from '@/lib/civil-date';

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

const standard = makeStandardCalendar(); // Mon–Fri 08:00–12:00, 13:00–17:00, 8 h/day
// Monday 12.01.2026 is a holiday on the site calendar.
const siteHoliday = makeStandardCalendar('cal:site', {
  exceptions: [{ date: '2026-01-12', periods: [] }],
});
const at = (month: number, day: number, hour = 0, minute = 0): number =>
  civilDaysFromYmd(2026, month, day) * MINUTES_PER_DAY + hour * 60 + minute;

/** Early dates the real solver gives one activity of `minutes` with an SNET at `date`. */
function solveSnet(
  calendar: ScheduleCalendar,
  minutes: number,
  date: WallClock,
): { start: number | null; finish: number | null } {
  const doc = makeDocument({
    calendars: [calendar],
    activities: [
      makeActivity({
        id: 'a1',
        code: 'A1',
        calendarId: calendar.id,
        originalDuration: minutes,
        constraint: { type: 'start_on_or_after', date },
      }),
    ],
  });
  const solved = solve(doc, { calculatedAt: '2026-01-01T00:00:00.000Z' });
  if (!solved.ok) throw new Error(solved.error.message);
  const a1 = solved.summary.activities.a1!;
  return {
    start: wallClockToCivilMinutes(a1.earlyStart),
    finish: wallClockToCivilMinutes(a1.earlyFinish),
  };
}

describe('Gantt drag state machine', () => {
  const ts = createTimescale('day', origin); // 32 px/day

  it('snaps bar-move to whole working days and commits an SNET constraint', () => {
    const hit = hitTestGanttTarget(160, 14, rows, ts, 0, 0, true)!;
    expect(hit.kind).toBe('bar-move');
    const started = startGanttDrag(hit, 160, 14, { hoursPerDay: 8, calendar: standard })!;
    // Move right by 3 days (3 * 32 = 96 px -> 256): Wed 07.01 -> Sat 10.01, which snaps to Mon 12.01 08:00
    const moved = updateGanttDrag(started, 256, 14, rows, ts, 0, 0);
    expect(moved.overlay).toMatchObject({
      kind: 'bar-ghost',
      mode: 'bar-move',
      startMinute: at(1, 12, 8),
      badgeLabel: '12.01.2026',
    });
    expect(commitGanttDrag(moved)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-12T08:00' } },
    });
  });

  it('snaps bar-resize to working days (min 1 day) and commits originalDuration and remainingDuration', () => {
    const hit = hitTestGanttTarget(222, 16, rows, ts, 0, 0, true)!;
    expect(hit.kind).toBe('bar-resize');
    const started = startGanttDrag(hit, 222, 16, { hoursPerDay: 8, calendar: standard })!;
    // a1 covers Wed 07, Thu 08 and Fri 09 (3 working days). Extending to x = 288 (the 14.01
    // boundary) adds Mon 12 and Tue 13: 5 working days = 2400 minutes.
    expect(started.overlay).toMatchObject({ badgeLabel: '3 d' }); // new: badge on grab
    const resized = updateGanttDrag(started, 288, 16, rows, ts, 0, 0);
    expect(resized.overlay).toMatchObject({
      kind: 'bar-ghost',
      mode: 'bar-resize',
      finishMinute: at(1, 14),
      badgeLabel: '5 d',
    });
    expect(commitGanttDrag(resized)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 5 * 8 * 60, remainingDuration: 5 * 8 * 60 },
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

  it("skips weekends and the activity calendar's holidays when moving and resizing", () => {
    const moveHit = hitTestGanttTarget(160, 14, rows, ts, 0, 0, true)!;
    // Sat 10 -> Sun 11 -> holiday Mon 12 -> Tue 13.01
    const moved = updateGanttDrag(
      startGanttDrag(moveHit, 160, 14, { hoursPerDay: 8, calendar: siteHoliday })!,
      256,
      14,
      rows,
      ts,
      0,
      0,
    );
    expect(moved.overlay).toMatchObject({ startMinute: at(1, 13, 8), badgeLabel: '13.01.2026' });
    expect(commitGanttDrag(moved)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-13T08:00' } },
    });
    // Moving left onto Sun 04.01 snaps forward to Mon 05.01, as Calculate does with a weekend SNET
    const movedBack = updateGanttDrag(
      startGanttDrag(moveHit, 160, 14, { hoursPerDay: 8, calendar: standard })!,
      64,
      14,
      rows,
      ts,
      0,
      0,
    );
    expect(movedBack.overlay).toMatchObject({ startMinute: at(1, 5, 8), badgeLabel: '05.01.2026' });
    expect(commitGanttDrag(movedBack)).toMatchObject({
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-05T08:00' } },
    });
    // Resizing to the 14.01 boundary adds only Tue 13 (Mon 12 is a holiday): 3 + 1 = 4 d
    const resizeHit = hitTestGanttTarget(222, 16, rows, ts, 0, 0, true)!;
    const resized = updateGanttDrag(
      startGanttDrag(resizeHit, 222, 16, { hoursPerDay: 8, calendar: siteHoliday })!,
      288,
      16,
      rows,
      ts,
      0,
      0,
    );
    expect(resized.overlay).toMatchObject({ badgeLabel: '4 d' });
    expect(commitGanttDrag(resized)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 1920, remainingDuration: 1920 },
    });
  });

  it('previews the dates Calculate gives and keeps the real duration on a nudge', () => {
    const opts = { hoursPerDay: 8, calendar: standard, durationMinutes: 3 * 480 };
    // 3 d with SNET Wed 07.01 08:00 solves to Wed 07.01 08:00 -> Fri 09.01 17:00
    const solved: GanttRow = {
      ...rows[0]!,
      start: at(1, 7, 8),
      finish: at(1, 9, 17),
      progressFinish: null,
    };
    const x2 = ts.x(at(1, 9, 17)); // 150.67
    const resizeStart = startGanttDrag(
      hitTestGanttTarget(x2 - 2, 16, [solved], ts, 0, 0, true)!,
      x2 - 2,
      16,
      opts,
    )!;
    expect(resizeStart.mode).toBe('bar-resize');
    expect(resizeStart.overlay).toMatchObject({ badgeLabel: '3 d' });
    const resized = updateGanttDrag(resizeStart, 288, 16, [solved], ts, 0, 0);
    expect(resized.overlay).toMatchObject({
      startMinute: at(1, 7, 8),
      finishMinute: at(1, 13, 17),
      badgeLabel: '5 d',
    });
    expect(commitGanttDrag(resized)).toMatchObject({
      changes: { originalDuration: 2400, remainingDuration: 2400 },
    });
    const nudged = updateGanttDrag(resizeStart, x2 + 1, 16, [solved], ts, 0, 0);
    expect(nudged.overlay).toMatchObject({ finishMinute: at(1, 9, 17), badgeLabel: '3 d' });
    expect(commitGanttDrag(nudged)).toMatchObject({
      changes: { originalDuration: 1440, remainingDuration: 1440 },
    });

    const mid = (ts.x(at(1, 7, 8)) + x2) / 2; // 112.67
    const moveStart = startGanttDrag(
      hitTestGanttTarget(mid, 14, [solved], ts, 0, 0, true)!,
      mid,
      14,
      opts,
    )!;
    expect(moveStart.mode).toBe('bar-move');
    const moved = updateGanttDrag(moveStart, mid + 96, 14, [solved], ts, 0, 0);
    expect(moved.overlay).toMatchObject({
      startMinute: at(1, 12, 8),
      finishMinute: at(1, 14, 17),
      badgeLabel: '12.01.2026',
    });

    // Mid-day start: 3 d with SNET Wed 07.01 13:00 solves to Mon 12.01 12:00 (the bar touches 4 days)
    const midday: GanttRow = { ...solved, start: at(1, 7, 13), finish: at(1, 12, 12) };
    const mx2 = ts.x(at(1, 12, 12)); // 240
    const middayStart = startGanttDrag(
      hitTestGanttTarget(mx2 - 2, 16, [midday], ts, 0, 0, true)!,
      mx2 - 2,
      16,
      opts,
    )!;
    expect(middayStart.overlay).toMatchObject({ badgeLabel: '3 d' });
    expect(
      commitGanttDrag(updateGanttDrag(middayStart, mx2 + 1, 16, [midday], ts, 0, 0)),
    ).toMatchObject({ changes: { originalDuration: 1440 } });
    // The pointer moves 50 px (1.56 days) from the grab at x = 238, which rounds to 2 days: the
    // finish boundary 13.01 moves to 15.01 and adds Tue 13 and Wed 14, so 3 + 2 = 5 d.
    const middayResized = updateGanttDrag(middayStart, 288, 16, [midday], ts, 0, 0);
    expect(middayResized.overlay).toMatchObject({
      finishMinute: at(1, 14, 12),
      badgeLabel: '5 d',
    });
    expect(commitGanttDrag(middayResized)).toMatchObject({
      changes: { originalDuration: 2400, remainingDuration: 2400 },
    });
    // 5 d with SNET Wed 07.01 13:00 solves to Wed 14.01 12:00, the ghost's finish
    expect(solveSnet(standard, 2400, '2026-01-07T13:00')).toEqual({
      start: at(1, 7, 13),
      finish: at(1, 14, 12),
    });
  });

  it('keeps the initial duration when the pointer only jitters vertically inside the resize handle', () => {
    const jitter = (
      row: GanttRow,
      scale: Timescale,
      x: number,
      durationMinutes: number,
    ): GanttDragState => {
      const hit = hitTestGanttTarget(x, 16, [row], scale, 0, 0, true)!;
      expect(hit.kind).toBe('bar-resize');
      const started = startGanttDrag(hit, x, 16, {
        hoursPerDay: 8,
        calendar: standard,
        durationMinutes,
      })!;
      return updateGanttDrag(started, x, 19, [row], scale, 0, 0); // +3 px down, no x movement
    };

    // Day zoom: 3 d with SNET Wed 07.01 13:00 solves to Mon 12.01 12:00 (x2 = 240)
    const midday: GanttRow = {
      ...rows[0]!,
      start: at(1, 7, 13),
      finish: at(1, 12, 12),
      progressFinish: null,
    };
    expect(ts.x(at(1, 12, 12))).toBe(240);
    for (const x of [235, 237, 239]) {
      const moved = jitter(midday, ts, x, 1440);
      expect(moved.overlay).toMatchObject({ finishMinute: at(1, 12, 12), badgeLabel: '3 d' });
      expect(commitGanttDrag(moved)).toEqual({
        type: 'updateActivity',
        activityId: 'a1',
        changes: { originalDuration: 1440, remainingDuration: 1440 },
      });
    }

    // Day zoom: 2.5 d from Wed 07.01 08:00 ends Fri 09.01 12:00 (x2 = 144)
    const halfDay: GanttRow = { ...midday, start: at(1, 7, 8), finish: at(1, 9, 12) };
    expect(ts.x(at(1, 9, 12))).toBe(144);
    for (const x of [139, 141, 143]) {
      const moved = jitter(halfDay, ts, x, 1200);
      expect(moved.overlay).toMatchObject({ finishMinute: at(1, 9, 12), badgeLabel: '3 d' });
      expect(commitGanttDrag(moved)).toEqual({
        type: 'updateActivity',
        activityId: 'a1',
        changes: { originalDuration: 1200, remainingDuration: 1200 },
      });
    }

    // Week zoom (12 px/day): 3 d Wed 07.01 08:00 -> Fri 09.01 17:00 (x2 = 56.5)
    const week = createTimescale('week', origin);
    const fullDays: GanttRow = { ...midday, start: at(1, 7, 8), finish: at(1, 9, 17) };
    const wx2 = week.x(at(1, 9, 17));
    expect(wx2).toBe(56.5);
    for (const x of [wx2 - 5, wx2 - 3]) {
      const moved = jitter(fullDays, week, x, 1440);
      expect(moved.overlay).toMatchObject({ finishMinute: at(1, 9, 17), badgeLabel: '3 d' });
      expect(commitGanttDrag(moved)).toEqual({
        type: 'updateActivity',
        activityId: 'a1',
        changes: { originalDuration: 1440, remainingDuration: 1440 },
      });
    }
  });

  it('builds the move ghost from the snapped start plus the working duration, as Calculate does', () => {
    // 3 d with SNET Wed 07.01 13:00 solves to Mon 12.01 12:00
    const midday: GanttRow = {
      ...rows[0]!,
      start: at(1, 7, 13),
      finish: at(1, 12, 12),
      progressFinish: null,
    };
    const mid = (ts.x(at(1, 7, 13)) + ts.x(at(1, 12, 12))) / 2; // 160.67
    const hit = hitTestGanttTarget(mid, 14, [midday], ts, 0, 0, true)!;
    expect(hit.kind).toBe('bar-move');
    const started = startGanttDrag(hit, mid, 14, {
      hoursPerDay: 8,
      calendar: standard,
      durationMinutes: 1440,
    })!;

    // +32 px: Thu 08.01 08:00 plus 3 working days ends Mon 12.01 17:00
    const oneDay = updateGanttDrag(started, mid + 32, 14, [midday], ts, 0, 0);
    expect(oneDay.overlay).toMatchObject({
      startMinute: at(1, 8, 8),
      finishMinute: at(1, 12, 17),
      badgeLabel: '08.01.2026',
    });
    expect(commitGanttDrag(oneDay)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-08T08:00' } },
    });
    expect(solveSnet(standard, 1440, '2026-01-08T08:00')).toEqual({
      start: at(1, 8, 8),
      finish: at(1, 12, 17),
    });

    // +96 px: Sat 10.01 snaps to Mon 12.01 08:00, plus 3 working days ends Wed 14.01 17:00
    const threeDays = updateGanttDrag(started, mid + 96, 14, [midday], ts, 0, 0);
    expect(threeDays.overlay).toMatchObject({
      startMinute: at(1, 12, 8),
      finishMinute: at(1, 14, 17),
      badgeLabel: '12.01.2026',
    });
    expect(commitGanttDrag(threeDays)).toEqual({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-12T08:00' } },
    });
    expect(solveSnet(standard, 1440, '2026-01-12T08:00')).toEqual({
      start: at(1, 12, 8),
      finish: at(1, 14, 17),
    });
  });

  it('clamps bar-progress between 0 and 100% and commits a setPercentComplete command (D13)', () => {
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
      type: 'setPercentComplete',
      activityId: 'a1',
      percentComplete: 50,
    });

    // Drag past right edge -> 100 %
    const full = updateGanttDrag(started, 300, 22, rows, ts, 0, 0);
    expect(commitGanttDrag(full)).toEqual({
      type: 'setPercentComplete',
      activityId: 'a1',
      percentComplete: 100,
    });

    // Drag past left edge (x1 = 64) -> 0 %
    const none = updateGanttDrag(started, 10, 22, rows, ts, 0, 0);
    expect(commitGanttDrag(none)).toEqual({
      type: 'setPercentComplete',
      activityId: 'a1',
      percentComplete: 0,
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
