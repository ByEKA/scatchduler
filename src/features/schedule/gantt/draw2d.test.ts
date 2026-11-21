// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CanvasDraw2D, createRecordingDraw2D } from '@/features/schedule/gantt/draw2d';

describe('Draw2D (S12)', () => {
  it('forwards every CanvasDraw2D method to CanvasRenderingContext2D with pixelRatio scaling', () => {
    const ctx = {
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
      measureText: vi.fn(() => ({ width: 42 })),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;

    const draw = new CanvasDraw2D(ctx, 800, 400, 2);
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(draw.width).toBe(800);
    expect(draw.height).toBe(400);

    draw.save();
    draw.clipRect(10, 20, 100, 50);
    draw.fillRect(0, 0, 50, 20, 'rgb(1, 2, 3)');
    draw.strokeRect(1, 2, 30, 10, 'rgb(4, 5, 6)', 2);
    draw.line(0, 10, 100, 10, 'rgb(7, 8, 9)', { width: 1, dash: [4, 3] });
    draw.polyline(
      [
        [0, 0],
        [10, 0],
        [10, 20],
      ],
      'rgb(9, 8, 7)',
      { width: 1.5 },
    );
    draw.fillPolygon(
      [
        [10, 0],
        [16, 6],
        [10, 12],
        [4, 6],
      ],
      'rgb(10, 20, 30)',
    );
    draw.text(12, 16, 'A1010', {
      color: 'rgb(0, 0, 0)',
      font: '11px Inter',
      align: 'center',
      baseline: 'middle',
    });
    expect(draw.measureText('A1010', '11px Inter')).toBe(42);
    draw.restore();

    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.clip).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 50, 20);
    expect(ctx.strokeRect).toHaveBeenCalled();
    expect(ctx.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.fillText).toHaveBeenCalledWith('A1010', 12, 16);
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('records calls deterministically in headless Node via createRecordingDraw2D', () => {
    const rec = createRecordingDraw2D(600, 320);
    rec.fillRect(10, 20, 80, 16, 'var(--gantt-bar)');
    rec.line(0, 32, 600, 32, 'var(--gantt-grid-line)', { width: 1 });
    expect(rec.measureText('Hello', '12px sans-serif')).toBeGreaterThan(0);
    expect(rec.calls).toEqual([
      { op: 'fillRect', args: [10, 20, 80, 16, 'var(--gantt-bar)'] },
      { op: 'line', args: [0, 32, 600, 32, 'var(--gantt-grid-line)', { width: 1 }] },
    ]);
  });
});
