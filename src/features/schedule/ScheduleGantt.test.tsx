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
});
