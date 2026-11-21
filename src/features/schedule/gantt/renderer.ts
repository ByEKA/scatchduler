import type { ActivityType, RelationshipType } from '@/data/schedule-types';
import type { Draw2D } from '@/features/schedule/gantt/draw2d';
import { routeOrthogonalLink } from '@/features/schedule/gantt/links';
import type { GanttTheme } from '@/features/schedule/gantt/theme';
import type { Timescale } from '@/features/schedule/gantt/timescale';
import { MINUTES_PER_DAY } from '@/lib/civil-date';

export const GANTT_ROW_HEIGHT = 32;
export const GANTT_HEADER_HEIGHT = 44;

export interface GanttRow {
  key: string;
  kind: 'wbs' | 'activity';
  activityType: ActivityType | null;
  start: number | null;
  finish: number | null;
  progressFinish: number | null;
  isCritical: boolean;
  isNearCritical: boolean;
  label: string;
}

export interface GanttLink {
  id: string;
  fromRow: number;
  toRow: number;
  type: RelationshipType;
  fromMinute: number;
  toMinute: number;
  isDriving: boolean;
  isCritical: boolean;
}

export interface GanttScene {
  rows: readonly GanttRow[];
  links: readonly GanttLink[];
  timescale: Timescale;
  scrollTop: number;
  scrollLeft: number;
  statusMinute: number | null;
  todayMinute: number | null;
  nonWorkingDays: (dayMinute: number) => boolean;
  show: { critical: boolean; links: boolean; drivingPath: ReadonlySet<string> | null };
  selectedKey: string | null;
  theme: GanttTheme;
}

const BAR_HEIGHT = 16;
const BAR_OFFSET_Y = (GANTT_ROW_HEIGHT - BAR_HEIGHT) / 2;
const MIN_BAR_WIDTH = 4;
const MILESTONE_RADIUS = 6;
const HORIZONTAL_CULL_MARGIN = 24;
const HEADER_TOP_FONT = '500 11px Inter Variable, ui-sans-serif, system-ui, sans-serif';
const HEADER_BOTTOM_FONT = '400 11px Inter Variable, ui-sans-serif, system-ui, sans-serif';

/** Renders the sticky two-tier Gantt timescale header (44 px tall) aligned with the Grid header. */
export function renderTimescaleHeader(
  draw: Draw2D,
  timescale: Timescale,
  scrollLeft: number,
  theme: GanttTheme,
): void {
  const half = Math.floor(draw.height / 2);
  draw.fillRect(0, 0, draw.width, draw.height, theme.card);
  const [topCells, bottomCells] = timescale.tiers(scrollLeft, scrollLeft + draw.width);

  // Top tier
  for (const cell of topCells) {
    const x = cell.x - scrollLeft;
    if (x + cell.width < 0 || x > draw.width) continue;
    draw.line(x, 0, x, half, theme.gridLine, { width: 1 });
    const labelX = Math.max(x + 6, 6);
    if (labelX < x + cell.width - 4) {
      draw.text(labelX, half / 2, cell.label, {
        color: theme.foreground,
        font: HEADER_TOP_FONT,
        align: 'left',
        baseline: 'middle',
      });
    }
  }

  // Tier divider
  draw.line(0, half, draw.width, half, theme.gridLine, { width: 1 });

  // Bottom tier
  for (const cell of bottomCells) {
    const x = cell.x - scrollLeft;
    if (x + cell.width < 0 || x > draw.width) continue;
    draw.line(x, half, x, draw.height, theme.gridLine, { width: 1 });
    const center = x + cell.width / 2;
    if (center >= 0 && center <= draw.width) {
      draw.text(center, half + (draw.height - half) / 2, cell.label, {
        color: theme.mutedForeground,
        font: HEADER_BOTTOM_FONT,
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  // Bottom border matching grid header
  draw.line(0, draw.height - 1, draw.width, draw.height - 1, theme.gridLine, { width: 1 });
}

/**
 * Pure headless Gantt renderer drawing only visible rows and visible day columns onto `Draw2D`
 * (spec §7.2, S6, S10, S12).
 */
export function renderGantt(draw: Draw2D, scene: GanttScene): void {
  const { rows, timescale, scrollTop, scrollLeft, theme, show } = scene;
  const viewWidth = draw.width;
  const viewHeight = draw.height;

  // 1. Card background
  draw.fillRect(0, 0, viewWidth, viewHeight, theme.card);

  // 2. Weekend / non-working day vertical bands (day & week zoom only)
  if (timescale.zoom === 'day' || timescale.zoom === 'week') {
    const startMin = timescale.minuteAt(scrollLeft);
    const endMin = timescale.minuteAt(scrollLeft + viewWidth);
    const firstDay = Math.floor(startMin / MINUTES_PER_DAY);
    const lastDay = Math.ceil(endMin / MINUTES_PER_DAY);
    for (let d = firstDay; d <= lastDay; d++) {
      const dayMin = d * MINUTES_PER_DAY;
      if (!scene.nonWorkingDays(dayMin)) continue;
      const x1 = timescale.x(dayMin) - scrollLeft;
      const x2 = timescale.x(dayMin + MINUTES_PER_DAY) - scrollLeft;
      if (x2 < 0 || x1 > viewWidth) continue;
      draw.fillRect(x1, 0, Math.max(1, x2 - x1), viewHeight, theme.weekend);
    }
  }

  // Viewport row bounds (O(viewport rows))
  const firstRow = Math.max(0, Math.floor(scrollTop / GANTT_ROW_HEIGHT));
  const lastRow = Math.min(rows.length - 1, Math.ceil((scrollTop + viewHeight) / GANTT_ROW_HEIGHT));

  // 3. Selected row highlight + horizontal row dividers
  for (let i = firstRow; i <= lastRow; i++) {
    const row = rows[i]!;
    const y = i * GANTT_ROW_HEIGHT - scrollTop;
    if (row.key === scene.selectedKey) {
      draw.fillRect(0, y, viewWidth, GANTT_ROW_HEIGHT, theme.accent);
    }
    draw.line(0, y + GANTT_ROW_HEIGHT, viewWidth, y + GANTT_ROW_HEIGHT, theme.gridLine, {
      width: 1,
    });
  }

  // 4. Today dashed line & status-date solid line
  if (scene.todayMinute !== null) {
    const tx = timescale.x(scene.todayMinute) - scrollLeft;
    if (tx >= -2 && tx <= viewWidth + 2) {
      draw.line(tx, 0, tx, viewHeight, theme.todayLine, { width: 1, dash: [4, 4] });
    }
  }
  if (scene.statusMinute !== null) {
    const sx = timescale.x(scene.statusMinute) - scrollLeft;
    if (sx >= -2 && sx <= viewWidth + 2) {
      draw.line(sx, 0, sx, viewHeight, theme.statusLine, { width: 1.5 });
    }
  }

  // 5. Row shapes (WBS brackets, LOE bars, task bars + progress fill, milestone diamonds)
  const cullLeft = -HORIZONTAL_CULL_MARGIN;
  const cullRight = viewWidth + HORIZONTAL_CULL_MARGIN;
  const spotlight = show.drivingPath;

  for (let i = firstRow; i <= lastRow; i++) {
    const row = rows[i]!;
    if (row.start === null && row.finish === null) continue;

    const startMin = row.start ?? row.finish!;
    const finishMin = row.finish ?? row.start!;
    const x1 = timescale.x(startMin) - scrollLeft;
    const x2 = timescale.x(finishMin) - scrollLeft;
    if (x2 < cullLeft || x1 > cullRight) continue;

    const y = i * GANTT_ROW_HEIGHT - scrollTop;
    const isDimmed = spotlight !== null && !spotlight.has(row.key);

    if (isDimmed && draw.setAlpha) {
      draw.save();
      draw.setAlpha(0.25);
    }

    if (row.kind === 'wbs') {
      const width = Math.max(MIN_BAR_WIDTH, x2 - x1);
      const topY = y + 9;
      draw.fillRect(x1, topY, width, 5, theme.summary);
      draw.fillPolygon(
        [
          [x1, topY + 5],
          [x1 + 5, topY + 5],
          [x1, topY + 11],
        ],
        theme.summary,
      );
      draw.fillPolygon(
        [
          [x1 + width, topY + 5],
          [x1 + width - 5, topY + 5],
          [x1 + width, topY + 11],
        ],
        theme.summary,
      );
    } else if (
      row.activityType === 'start_milestone' ||
      row.activityType === 'finish_milestone'
    ) {
      const cx = row.activityType === 'finish_milestone' ? x2 : x1;
      const cy = y + GANTT_ROW_HEIGHT / 2;
      const color = row.isCritical && show.critical ? theme.critical : theme.milestone;
      draw.fillPolygon(
        [
          [cx, cy - MILESTONE_RADIUS],
          [cx + MILESTONE_RADIUS, cy],
          [cx, cy + MILESTONE_RADIUS],
          [cx - MILESTONE_RADIUS, cy],
        ],
        color,
      );
    } else if (row.activityType === 'level_of_effort') {
      const width = Math.max(MIN_BAR_WIDTH, x2 - x1);
      const barY = y + (GANTT_ROW_HEIGHT - 6) / 2;
      draw.fillRect(x1, barY, width, 6, theme.summary);
    } else {
      const width = Math.max(MIN_BAR_WIDTH, x2 - x1);
      const useCrit = row.isCritical && show.critical;
      const barColor = useCrit ? theme.critical : theme.bar;
      draw.fillRect(x1, y + BAR_OFFSET_Y, width, BAR_HEIGHT, barColor);
      if (row.progressFinish !== null && row.progressFinish > startMin) {
        const px = Math.min(x1 + width, timescale.x(row.progressFinish) - scrollLeft);
        if (px > x1) {
          const progressColor = useCrit ? theme.criticalProgress : theme.barProgress;
          draw.fillRect(x1, y + BAR_OFFSET_Y, px - x1, BAR_HEIGHT, progressColor);
        }
      }
    }

    if (isDimmed && draw.setAlpha) {
      draw.restore();
    }
  }

  // 6. Relationship links layer (orthogonal routing, viewport-culled)
  if (show.links && scene.links.length > 0) {
    const minLinkRow = firstRow - 5;
    const maxLinkRow = lastRow + 5;
    for (let i = 0; i < scene.links.length; i++) {
      const link = scene.links[i]!;
      if (
        (link.fromRow < minLinkRow && link.toRow < minLinkRow) ||
        (link.fromRow > maxLinkRow && link.toRow > maxLinkRow)
      ) {
        continue;
      }

      const fromX = timescale.x(link.fromMinute) - scrollLeft;
      const toX = timescale.x(link.toMinute) - scrollLeft;
      if ((fromX < cullLeft && toX < cullLeft) || (fromX > cullRight && toX > cullRight)) {
        continue;
      }

      const fromY = link.fromRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2 - scrollTop;
      const toY = link.toRow * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2 - scrollTop;
      const routed = routeOrthogonalLink({
        type: link.type,
        fromX,
        fromY,
        toX,
        toY,
        rowHeight: GANTT_ROW_HEIGHT,
      });

      const inSpotlight =
        spotlight === null || spotlight.has(`rel:${link.id}`) || spotlight.has(link.id);
      const isDimmed = !inSpotlight;
      const highlightDriving =
        link.isDriving || (spotlight !== null && inSpotlight);
      const color = highlightDriving ? theme.linkDriving : theme.link;

      if (isDimmed && draw.setAlpha) {
        draw.save();
        draw.setAlpha(0.18);
      }

      draw.polyline(
        routed.points,
        color,
        highlightDriving ? { width: 1.25 } : { width: 1, dash: [4, 3] },
      );
      draw.fillPolygon(routed.arrowHead, color);

      if (isDimmed && draw.setAlpha) {
        draw.restore();
      }
    }
  }
}
