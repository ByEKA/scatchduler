// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { RelationshipType } from '@/data/schedule-types';
import { routeOrthogonalLink } from '@/features/schedule/gantt/links';

function expectOrthogonal(points: ReadonlyArray<readonly [number, number]>): void {
  expect(points.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1]!;
    const [x2, y2] = points[i]!;
    expect(x1 === x2 || y1 === y2).toBe(true);
  }
}

describe('routeOrthogonalLink', () => {
  const types: RelationshipType[] = ['FS', 'SS', 'FF', 'SF'];

  it.each(types)(
    'routes %s links strictly orthogonally for forward and overlapping geometry',
    (type) => {
      const forward = routeOrthogonalLink({
        type,
        fromX: 100,
        fromY: 16,
        toX: 180,
        toY: 48,
        rowHeight: 32,
      });
      expectOrthogonal(forward.points);
      expect(forward.points[0]).toEqual([100, 16]);
      expect(forward.points[forward.points.length - 1]).toEqual([180, 48]);
      expect(forward.arrowHead).toHaveLength(3);
      expect(forward.arrowHead[0]).toEqual([180, 48]);

      const backward = routeOrthogonalLink({
        type,
        fromX: 180,
        fromY: 48,
        toX: 100,
        toY: 16,
        rowHeight: 32,
      });
      expectOrthogonal(backward.points);
      expect(backward.points[0]).toEqual([180, 48]);
      expect(backward.points[backward.points.length - 1]).toEqual([100, 16]);
      expect(backward.arrowHead).toHaveLength(3);
      expect(backward.arrowHead[0]).toEqual([100, 16]);

      // Arrowhead orientation: FS/SS point right (base x < tip x), FF/SF point left (base x > tip x)
      if (type === 'FS' || type === 'SS') {
        expect(forward.arrowHead[1]![0]).toBeLessThan(forward.arrowHead[0]![0]);
        expect(backward.arrowHead[1]![0]).toBeLessThan(backward.arrowHead[0]![0]);
      } else {
        expect(forward.arrowHead[1]![0]).toBeGreaterThan(forward.arrowHead[0]![0]);
        expect(backward.arrowHead[1]![0]).toBeGreaterThan(backward.arrowHead[0]![0]);
      }
    },
  );
});
