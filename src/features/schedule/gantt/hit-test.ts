import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import { PX_PER_DAY, type GanttZoom, type Timescale } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, MINUTES_PER_DAY } from '@/lib/civil-date';

const MIN_BAR_WIDTH = 4;
const BAR_HIT_PAD_X = 2;
const MILESTONE_RADIUS = 6;
const MILESTONE_TOLERANCE = 6;
const ZOOM_CANDIDATES: readonly GanttZoom[] = ['day', 'week', 'month', 'quarter'];

/**
 * Pure bar/milestone hit-test at viewport coordinates `(x, y)` relative to the Gantt body canvas
 * (spec §2.3, §7.2). Exposed as the seam for Phase 4 later drag-and-drop.
 */
export function hitTestBar(
  x: number,
  y: number,
  rows: readonly GanttRow[],
  timescale: Timescale,
  scrollLeft: number,
  scrollTop: number,
): GanttRow | null {
  if (y < 0 || rows.length === 0) return null;
  const rowIndex = Math.floor((y + scrollTop) / GANTT_ROW_HEIGHT);
  if (rowIndex < 0 || rowIndex >= rows.length) return null;

  const row = rows[rowIndex]!;
  if (row.start === null && row.finish === null) return null;

  const startMin = row.start ?? row.finish!;
  const finishMin = row.finish ?? row.start!;
  const x1 = timescale.x(startMin) - scrollLeft;
  const x2 = timescale.x(finishMin) - scrollLeft;
  const rowCenterY = rowIndex * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2 - scrollTop;

  if (row.activityType === 'start_milestone' || row.activityType === 'finish_milestone') {
    const cx = row.activityType === 'finish_milestone' ? x2 : x1;
    const hitRadius = MILESTONE_RADIUS + MILESTONE_TOLERANCE;
    if (Math.abs(x - cx) <= hitRadius && Math.abs(y - rowCenterY) <= hitRadius) {
      return row;
    }
    return null;
  }

  const width = Math.max(MIN_BAR_WIDTH, x2 - x1);
  if (x >= x1 - BAR_HIT_PAD_X && x <= x1 + width + BAR_HIT_PAD_X) {
    return row;
  }
  return null;
}

/**
 * Chooses the most detailed zoom level and origin minute that frames all dated rows inside
 * `viewportWidth` with horizontal padding (spec §7.2).
 */
export function computeZoomToFit(
  rows: readonly GanttRow[],
  viewportWidth: number,
): { zoom: GanttZoom; originMinute: number; scrollLeft: number } {
  let minStart = Number.POSITIVE_INFINITY;
  let maxFinish = Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    if (row.start !== null && row.start < minStart) minStart = row.start;
    if (row.finish !== null && row.finish > maxFinish) maxFinish = row.finish;
    if (row.start !== null && row.start > maxFinish) maxFinish = row.start;
    if (row.finish !== null && row.finish < minStart) minStart = row.finish;
  }

  if (!Number.isFinite(minStart) || !Number.isFinite(maxFinish)) {
    return {
      zoom: 'week',
      originMinute: civilDaysFromYmd(2026, 1, 1) * MINUTES_PER_DAY,
      scrollLeft: 0,
    };
  }

  const spanDays = Math.max(1, (maxFinish - minStart) / MINUTES_PER_DAY);
  const padDays = Math.max(2, Math.ceil(spanDays * 0.08));
  const paddedDays = spanDays + padDays * 2;
  const targetWidth = Math.max(240, viewportWidth);

  let chosen: GanttZoom = 'quarter';
  for (const zoom of ZOOM_CANDIDATES) {
    if (paddedDays * PX_PER_DAY[zoom] <= targetWidth) {
      chosen = zoom;
      break;
    }
  }

  const originDay = Math.floor((minStart - padDays * MINUTES_PER_DAY) / MINUTES_PER_DAY);
  return {
    zoom: chosen,
    originMinute: originDay * MINUTES_PER_DAY,
    scrollLeft: 0,
  };
}
