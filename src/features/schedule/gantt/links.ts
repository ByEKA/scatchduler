import type { RelationshipType } from '@/data/schedule-types';

export interface RoutedLink {
  points: Array<readonly [number, number]>;
  arrowHead: Array<readonly [number, number]>; // 3-vertex triangle at target bar edge
}

const STUB = 10;
const ARROW_LEN = 5;
const ARROW_HALF_H = 3.5;

/**
 * Computes strictly orthogonal (horizontal + vertical only) connector polylines and arrowheads
 * for FS, SS, FF, and SF schedule relationships (spec §7.2).
 */
export function routeOrthogonalLink(params: {
  type: RelationshipType;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  rowHeight: number;
}): RoutedLink {
  const { type, fromX, fromY, toX, toY, rowHeight } = params;
  const dir = toY >= fromY ? 1 : -1;
  const midY = fromY + dir * (rowHeight / 2);

  let points: Array<readonly [number, number]>;
  let entersFromLeft: boolean;

  switch (type) {
    case 'FS': {
      entersFromLeft = true;
      if (toX >= fromX + STUB) {
        const midX = (fromX + toX) / 2;
        points = [
          [fromX, fromY],
          [midX, fromY],
          [midX, toY],
          [toX, toY],
        ];
      } else {
        const outX = fromX + STUB;
        const inX = toX - STUB;
        points = [
          [fromX, fromY],
          [outX, fromY],
          [outX, midY],
          [inX, midY],
          [inX, toY],
          [toX, toY],
        ];
      }
      break;
    }

    case 'SS': {
      entersFromLeft = true;
      const gutterX = Math.min(fromX, toX) - STUB;
      points = [
        [fromX, fromY],
        [gutterX, fromY],
        [gutterX, toY],
        [toX, toY],
      ];
      break;
    }

    case 'FF': {
      entersFromLeft = false;
      const gutterX = Math.max(fromX, toX) + STUB;
      points = [
        [fromX, fromY],
        [gutterX, fromY],
        [gutterX, toY],
        [toX, toY],
      ];
      break;
    }

    case 'SF': {
      entersFromLeft = false;
      if (toX <= fromX - STUB) {
        const midX = (fromX + toX) / 2;
        points = [
          [fromX, fromY],
          [midX, fromY],
          [midX, toY],
          [toX, toY],
        ];
      } else {
        const outX = fromX - STUB;
        const inX = toX + STUB;
        points = [
          [fromX, fromY],
          [outX, fromY],
          [outX, midY],
          [inX, midY],
          [inX, toY],
          [toX, toY],
        ];
      }
      break;
    }
  }

  const arrowHead: Array<readonly [number, number]> = entersFromLeft
    ? [
        [toX, toY],
        [toX - ARROW_LEN, toY - ARROW_HALF_H],
        [toX - ARROW_LEN, toY + ARROW_HALF_H],
      ]
    : [
        [toX, toY],
        [toX + ARROW_LEN, toY - ARROW_HALF_H],
        [toX + ARROW_LEN, toY + ARROW_HALF_H],
      ];

  return { points, arrowHead };
}
