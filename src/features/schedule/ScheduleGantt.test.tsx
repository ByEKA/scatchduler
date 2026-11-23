import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeActivity, makeDocument } from '@/engine/testing';
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
          originalDuration: expect.any(Number),
          remainingDuration: expect.any(Number),
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
          date: expect.stringMatching(/^2026-01-\d{2}T08:00$/),
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
});
