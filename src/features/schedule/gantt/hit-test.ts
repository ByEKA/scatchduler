import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import { PX_PER_DAY, type GanttZoom, type Timescale } from '@/features/schedule/gantt/timescale';
import { civilDaysFromYmd, MINUTES_PER_DAY } from '@/lib/civil-date';

const MIN_BAR_WIDTH = 4;
const BAR_HIT_PAD_X = 2;
const BAR_HEIGHT = 16;
const BAR_OFFSET_Y = (GANTT_ROW_HEIGHT - BAR_HEIGHT) / 2;
const MILESTONE_RADIUS = 6;
const MILESTONE_TOLERANCE = 6;
export const LINK_PORT_OFFSET = 8;
export const LINK_PORT_RADIUS = 4;
const LINK_PORT_HIT_RADIUS = 7;
const ZOOM_CANDIDATES: readonly GanttZoom[] = ['day', 'week', 'month', 'quarter'];

export type GanttHitTargetKind =
  | 'bar-select'
  | 'bar-move'
  | 'bar-resize'
  | 'bar-progress'
  | 'link-port-start'
  | 'link-port-finish';

export interface GanttHitTarget {
  kind: GanttHitTargetKind;
  row: GanttRow;
  rowIndex: number;
  portX?: number;
  portY?: number;
}

/**
 * Computes the viewport `(x, y)` coordinates of a row's start or finish connector port.
 */
export function getGanttPortCoords(
  row: GanttRow,
  rowIndex: number,
  port: 'start' | 'finish',
  timescale: Timescale,
  scrollLeft: number,
  scrollTop: number,
): { x: number; y: number } | null {
  if (row.start === null && row.finish === null) return null;
  const startMin = row.start ?? row.finish!;
  const finishMin = row.finish ?? row.start!;
  const x1 = timescale.x(startMin) - scrollLeft;
  const x2 = timescale.x(finishMin) - scrollLeft;
  const y = rowIndex * GANTT_ROW_HEIGHT + GANTT_ROW_HEIGHT / 2 - scrollTop;

  if (row.activityType === 'start_milestone' || row.activityType === 'finish_milestone') {
    const cx = row.activityType === 'finish_milestone' ? x2 : x1;
    const x =
      port === 'start'
        ? cx - MILESTONE_RADIUS - LINK_PORT_OFFSET
        : cx + MILESTONE_RADIUS + LINK_PORT_OFFSET;
    return { x, y };
  }

  const width = Math.max(MIN_BAR_WIDTH, x2 - x1);
  const x = port === 'start' ? x1 - LINK_PORT_OFFSET : x1 + width + LINK_PORT_OFFSET;
  return { x, y };
}

/**
 * Pure bar/milestone hit-test at viewport coordinates `(x, y)` relative to the Gantt body canvas
 * (spec §2.3, §7.2).
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
 * Extended hit-test distinguishing connector ports, resize edge, progress handle, and move body
 * when `editMode` is true (spec §5.1, S4). WBS and summary rows never return editable drag targets.
 */
export function hitTestGanttTarget(
  x: number,
  y: number,
  rows: readonly GanttRow[],
  timescale: Timescale,
  scrollLeft: number,
  scrollTop: number,
  editMode = false,
): GanttHitTarget | null {
  if (y < 0 || rows.length === 0) return null;
  const rowIndex = Math.floor((y + scrollTop) / GANTT_ROW_HEIGHT);
  if (rowIndex < 0 || rowIndex >= rows.length) return null;

  const row = rows[rowIndex]!;
  if (row.start === null && row.finish === null) return null;

  const isEditableActivity =
    editMode &&
    row.kind === 'activity' &&
    row.activityType !== 'wbs_summary' &&
    row.activityType !== 'level_of_effort';

  if (!isEditableActivity) {
    const hit = hitTestBar(x, y, rows, timescale, scrollLeft, scrollTop);
    return hit ? { kind: 'bar-select', row: hit, rowIndex } : null;
  }

  const startPort = getGanttPortCoords(row, rowIndex, 'start', timescale, scrollLeft, scrollTop);
  const finishPort = getGanttPortCoords(row, rowIndex, 'finish', timescale, scrollLeft, scrollTop);
  if (startPort && Math.hypot(x - startPort.x, y - startPort.y) <= LINK_PORT_HIT_RADIUS) {
    return {
      kind: 'link-port-start',
      row,
      rowIndex,
      portX: startPort.x,
      portY: startPort.y,
    };
  }
  if (finishPort && Math.hypot(x - finishPort.x, y - finishPort.y) <= LINK_PORT_HIT_RADIUS) {
    return {
      kind: 'link-port-finish',
      row,
      rowIndex,
      portX: finishPort.x,
      portY: finishPort.y,
    };
  }

  const startMin = row.start ?? row.finish!;
  const finishMin = row.finish ?? row.start!;
  const x1 = timescale.x(startMin) - scrollLeft;
  const x2 = timescale.x(finishMin) - scrollLeft;
  const rowTopY = rowIndex * GANTT_ROW_HEIGHT - scrollTop;
  const rowCenterY = rowTopY + GANTT_ROW_HEIGHT / 2;

  if (row.activityType === 'start_milestone' || row.activityType === 'finish_milestone') {
    const cx = row.activityType === 'finish_milestone' ? x2 : x1;
    const hitRadius = MILESTONE_RADIUS + MILESTONE_TOLERANCE;
    if (Math.abs(x - cx) <= hitRadius && Math.abs(y - rowCenterY) <= hitRadius) {
      return { kind: 'bar-move', row, rowIndex };
    }
    return null;
  }

  const width = Math.max(MIN_BAR_WIDTH, x2 - x1);
  const rightEdge = x1 + width;
  const barTop = rowTopY + BAR_OFFSET_Y;
  const barBottom = barTop + BAR_HEIGHT;

  // Progress handle: lower 6 px band near the progress boundary
  const progressX =
    row.progressFinish !== null && row.progressFinish > startMin
      ? Math.min(rightEdge, timescale.x(row.progressFinish) - scrollLeft)
      : x1;
  if (
    y >= barBottom - 6 &&
    y <= barBottom + 3 &&
    Math.abs(x - progressX) <= 6 &&
    progressX < rightEdge - 6
  ) {
    return { kind: 'bar-progress', row, rowIndex };
  }

  // Resize handle: right edge of task bar
  const resizeLeft = Math.max(x1 + 4, rightEdge - 6);
  if (x >= resizeLeft && x <= rightEdge + 4) {
    return { kind: 'bar-resize', row, rowIndex };
  }

  if (x >= x1 - BAR_HIT_PAD_X && x <= rightEdge + BAR_HIT_PAD_X) {
    return { kind: 'bar-move', row, rowIndex };
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
