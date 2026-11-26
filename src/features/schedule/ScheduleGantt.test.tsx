import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleDocument, SourceDateRecord, WallClock } from '@/data/schedule-types';
import { makeActivity, makeDocument, makeStandardCalendar } from '@/engine/testing';
import { buildVisibleRows } from '@/features/schedule/rows';
import { ScheduleGantt } from '@/features/schedule/ScheduleGantt';

function makeMockCanvasContext(): CanvasRenderingContext2D {
  return {
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 20 })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'middle',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

/** Imported dates for an as-imported bar. */
function importedDates(start: WallClock, finish: WallClock): SourceDateRecord {
  return {
    planned: { start, finish },
    early: { start, finish },
    late: { start, finish },
    remaining: { start, finish },
    totalFloat: 0,
    freeFloat: 0,
  };
}

/** Renders `doc` as an as-imported Gantt in Edit mode at Day zoom (32 px/day). */
function renderEditGantt(doc: ScheduleDocument): {
  canvas: HTMLElement;
  onDispatch: ReturnType<typeof vi.fn>;
} {
  const onDispatch = vi.fn();
  render(
    <ScheduleGantt
      rows={buildVisibleRows(doc, null, {}, new Set())}
      document={doc}
      summary={null}
      selectedKey="act:a1"
      showCritical
      showLinks
      drivingPath={null}
      zoom="day"
      mode="edit"
      onDispatch={onDispatch}
      onZoomChange={vi.fn()}
      onSelectKey={vi.fn()}
      scrollTop={0}
      onScrollTopChange={vi.fn()}
    />,
  );
  return { canvas: screen.getByLabelText('Gantt chart'), onDispatch };
}

function dragOn(canvas: HTMLElement, from: [number, number], to: [number, number]): void {
  fireEvent.pointerDown(canvas, { clientX: from[0], clientY: from[1], button: 0 });
  fireEvent.pointerMove(canvas, { clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { clientX: to[0], clientY: to[1], button: 0 });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(makeMockCanvasContext());
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 400,
    right: 640,
    width: 640,
    height: 400,
    toJSON: () => ({}),
  });
});

describe('ScheduleGantt', () => {
  it('selects row on bar click, shows hover tooltip, and zooms on Ctrl+Wheel', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          name: 'Excavation',
          originalDuration: 2400,
          remainingDuration: 2400,
          sourceDates: {
            planned: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            early: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            late: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            remaining: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            totalFloat: 0,
            freeFloat: 0,
          },
        }),
      ],
    });
    const rows = buildVisibleRows(doc, null, {}, new Set());
    const onSelectKey = vi.fn();
    const onZoomChange = vi.fn();

    render(
      <ScheduleGantt
        rows={rows}
        document={doc}
        summary={null}
        selectedKey={null}
        showCritical
        showLinks
        drivingPath={null}
        zoom="day"
        onZoomChange={onZoomChange}
        onSelectKey={onSelectKey}
        scrollTop={0}
        onScrollTopChange={vi.fn()}
      />,
    );

    const bodyCanvas = screen.getByLabelText('Gantt chart');

    // Origin defaults to 2 days before earliest bar (day 0 = 2026-01-03), so bar starts at x = 64+
    fireEvent.pointerMove(bodyCanvas, { clientX: 110, clientY: 16 });
    expect(screen.getByRole('tooltip')).toHaveTextContent('A1010 · Excavation');
    expect(screen.getByRole('tooltip')).toHaveTextContent('05.01.2026 → 10.01.2026');

    // Click bar selects the row
    fireEvent.pointerDown(bodyCanvas, { clientX: 110, clientY: 16, button: 0 });
    fireEvent.pointerUp(bodyCanvas, { clientX: 110, clientY: 16, button: 0 });
    expect(onSelectKey).toHaveBeenCalledWith('act:a1');

    // Ctrl+Wheel zooms out from 'day' to 'week'
    fireEvent.wheel(bodyCanvas, { clientX: 110, deltaY: 100, ctrlKey: true });
    expect(onZoomChange).toHaveBeenCalledWith('week');
  });

  it('dispatches updateActivity on bar resize and move, addRelationship on link draw, and cancels on Escape in Edit mode', () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          name: 'Excavation',
          originalDuration: 2400,
          remainingDuration: 2400,
          sourceDates: {
            planned: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            early: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            late: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            remaining: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            totalFloat: 0,
            freeFloat: 0,
          },
        }),
        makeActivity({
          id: 'a2',
          code: 'A1020',
          name: 'Foundation',
          originalDuration: 1440,
          remainingDuration: 1440,
          sourceDates: {
            planned: { start: '2026-01-10T08:00', finish: '2026-01-13T17:00' },
            early: { start: '2026-01-10T08:00', finish: '2026-01-13T17:00' },
            late: { start: '2026-01-10T08:00', finish: '2026-01-13T17:00' },
            remaining: { start: '2026-01-10T08:00', finish: '2026-01-13T17:00' },
            totalFloat: 0,
            freeFloat: 0,
          },
        }),
      ],
    });
    const rows = buildVisibleRows(doc, null, {}, new Set());
    const onDispatch = vi.fn();

    render(
      <ScheduleGantt
        rows={rows}
        document={doc}
        summary={null}
        selectedKey="act:a1"
        showCritical
        showLinks
        drivingPath={null}
        zoom="day"
        mode="edit"
        onDispatch={onDispatch}
        onZoomChange={vi.fn()}
        onSelectKey={vi.fn()}
        scrollTop={0}
        onScrollTopChange={vi.fn()}
      />,
    );

    const bodyCanvas = screen.getByLabelText('Gantt chart');

    // Origin is 2026-01-03T00:00 (2 days before 2026-01-05T08:00).
    // makeDocument() has no WBS nodes, so Row 0 is a1 (y = 0..32, center y = 16) and Row 1 is a2 (y = 32..64, center y = 48).
    // a1 start = day 2.333 -> x1 = 74.67, finish = day 7.708 -> x2 = 246.67.
    // 1. Drag a1 resize handle from x = 246, y = 16 to x = 310 -> updateActivity duration
    fireEvent.pointerDown(bodyCanvas, { clientX: 246, clientY: 16, button: 0 });
    fireEvent.pointerMove(bodyCanvas, { clientX: 310, clientY: 16 });
    fireEvent.pointerUp(bodyCanvas, { clientX: 310, clientY: 16, button: 0 });
    expect(onDispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'updateActivity',
        activityId: 'a1',
        changes: expect.objectContaining({
          originalDuration: 2880,
          remainingDuration: 2880,
        }),
      }),
    );

    // 2. Drag a1 body from x = 140, y = 16 to x = 204 -> updateActivity SNET constraint
    fireEvent.pointerDown(bodyCanvas, { clientX: 140, clientY: 16, button: 0 });
    fireEvent.pointerMove(bodyCanvas, { clientX: 204, clientY: 16 });
    fireEvent.pointerUp(bodyCanvas, { clientX: 204, clientY: 16, button: 0 });
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: {
        constraint: {
          type: 'start_on_or_after',
          date: '2026-01-07T08:00',
        },
      },
    });

    // 3. Drag from a1 finish port (x = 246.67 + 8 ≈ 255, y = 16) to a2 start port (a2 start = day 7.333 -> x1 = 234.67, start port ≈ 227, y = 48)
    fireEvent.pointerDown(bodyCanvas, { clientX: 255, clientY: 16, button: 0 });
    fireEvent.pointerMove(bodyCanvas, { clientX: 227, clientY: 48 });
    fireEvent.pointerUp(bodyCanvas, { clientX: 227, clientY: 48, button: 0 });
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'addRelationship',
      predecessorId: 'a1',
      successorId: 'a2',
      relType: 'FS',
      lagMinutes: 0,
      lagElapsed: false,
    });

    // 4. Escape cancels an active drag without dispatching
    onDispatch.mockClear();
    fireEvent.pointerDown(bodyCanvas, { clientX: 140, clientY: 16, button: 0 });
    fireEvent.pointerMove(bodyCanvas, { clientX: 204, clientY: 16 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(bodyCanvas, { clientX: 204, clientY: 16, button: 0 });
    expect(onDispatch).not.toHaveBeenCalled();
  });

  it("moves a bar to the next working day on the activity's own calendar", () => {
    const doc = makeDocument({
      settings: { ...makeDocument().settings, displayMode: 'as_imported' },
      calendars: [
        makeStandardCalendar('cal:standard'),
        makeStandardCalendar('cal:site', { exceptions: [{ date: '2026-01-07', periods: [] }] }),
      ],
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          name: 'Excavation',
          calendarId: 'cal:site',
          originalDuration: 2400,
          remainingDuration: 2400,
          sourceDates: {
            planned: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            early: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            late: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            remaining: { start: '2026-01-05T08:00', finish: '2026-01-10T17:00' },
            totalFloat: 0,
            freeFloat: 0,
          },
        }),
      ],
    });
    const rows = buildVisibleRows(doc, null, {}, new Set());
    const onDispatch = vi.fn();

    render(
      <ScheduleGantt
        rows={rows}
        document={doc}
        summary={null}
        selectedKey="act:a1"
        showCritical
        showLinks
        drivingPath={null}
        zoom="day"
        mode="edit"
        onDispatch={onDispatch}
        onZoomChange={vi.fn()}
        onSelectKey={vi.fn()}
        scrollTop={0}
        onScrollTopChange={vi.fn()}
      />,
    );

    const bodyCanvas = screen.getByLabelText('Gantt chart');

    // Wed 07.01 is a holiday on cal:site only, so +64 px from Mon 05.01 lands on Thu 08.01.
    fireEvent.pointerDown(bodyCanvas, { clientX: 140, clientY: 16, button: 0 });
    fireEvent.pointerMove(bodyCanvas, { clientX: 204, clientY: 16 });
    fireEvent.pointerUp(bodyCanvas, { clientX: 204, clientY: 16, button: 0 });
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-08T08:00' } },
    });
  });

  it('snaps an elapsed activity on the 24-hour calendar the engine schedules it on', () => {
    const base = makeDocument();
    const { canvas, onDispatch } = renderEditGantt({
      ...base,
      settings: { ...base.settings, displayMode: 'as_imported' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          originalDuration: 4320, // 3 elapsed days
          flags: { manual: false, elapsed: true, resourceDependent: false },
          sourceDates: importedDates('2026-01-05T08:00', '2026-01-08T08:00'),
        }),
      ],
    });

    // Origin is Sat 03.01 00:00: a1 runs x1 = 74.67 to x2 = 170.67.
    // +160 px from Mon 05.01 is Sat 10.01, a day the 24-hour calendar works from 00:00.
    dragOn(canvas, [120, 16], [280, 16]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-10T00:00' } },
    });

    // A vertical jitter on the resize handle keeps the 3 elapsed days.
    dragOn(canvas, [168, 16], [168, 19]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 4320, remainingDuration: 4320 },
    });

    // +32 px adds Fri 09.01, one 24-hour day: 4 d = 5760 minutes.
    dragOn(canvas, [168, 16], [200, 16]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 5760, remainingDuration: 5760 },
    });
  });

  it("resizes from the activity's duration when its imported dates span more working days", () => {
    const base = makeDocument();
    // 5 d whose imported dates ran over a holiday the activity's calendar does not have:
    // Mon 05.01 08:00 to Mon 12.01 17:00 spans 6 working days on cal:standard.
    const { canvas, onDispatch } = renderEditGantt({
      ...base,
      settings: { ...base.settings, displayMode: 'as_imported' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          originalDuration: 2400,
          sourceDates: importedDates('2026-01-05T08:00', '2026-01-12T17:00'),
        }),
      ],
    });

    // x2 = 310.67. A vertical jitter on the handle keeps 5 d, not the 6 d span.
    dragOn(canvas, [308, 16], [308, 19]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 2400, remainingDuration: 2400 },
    });

    // +32 px moves the finish boundary from 13.01 to 14.01 and adds Tue 13: 5 + 1 = 6 d.
    dragOn(canvas, [308, 16], [340, 16]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { originalDuration: 2880, remainingDuration: 2880 },
    });
  });

  it("snaps a move to the start of the first working period on the activity's calendar", () => {
    const early = makeStandardCalendar('cal:early', {
      week: [
        [],
        ...Array.from({ length: 5 }, () => [
          { start: 420, finish: 720 },
          { start: 780, finish: 960 },
        ]),
        [],
      ],
    });
    const base = makeDocument({ calendars: [makeStandardCalendar('cal:standard'), early] });
    const { canvas, onDispatch } = renderEditGantt({
      ...base,
      settings: { ...base.settings, displayMode: 'as_imported' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          calendarId: 'cal:early',
          originalDuration: 2400,
          sourceDates: importedDates('2026-01-05T07:00', '2026-01-09T16:00'),
        }),
      ],
    });

    // +64 px from Mon 05.01 is Wed 07.01, whose working day starts at 07:00 on cal:early.
    dragOn(canvas, [140, 16], [204, 16]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-07T07:00' } },
    });
  });

  it('keeps a move on a Saturday that a calendar exception makes a working day', () => {
    const base = makeDocument({
      calendars: [
        makeStandardCalendar('cal:standard', {
          exceptions: [
            {
              date: '2026-01-10',
              periods: [
                { start: 480, finish: 720 },
                { start: 780, finish: 1020 },
              ],
            },
          ],
        }),
      ],
    });
    const { canvas, onDispatch } = renderEditGantt({
      ...base,
      settings: { ...base.settings, displayMode: 'as_imported' },
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          originalDuration: 2400,
          sourceDates: importedDates('2026-01-05T08:00', '2026-01-09T17:00'),
        }),
      ],
    });

    // +160 px from Mon 05.01 is Sat 10.01, worked on this calendar.
    dragOn(canvas, [140, 16], [300, 16]);
    expect(onDispatch).toHaveBeenLastCalledWith({
      type: 'updateActivity',
      activityId: 'a1',
      changes: { constraint: { type: 'start_on_or_after', date: '2026-01-10T08:00' } },
    });
  });
});
