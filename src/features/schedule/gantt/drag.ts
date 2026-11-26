import type { RelationshipType } from '@/data/schedule-types';
import type { ScheduleCommand } from '@/features/schedule/commands';
import { getGanttPortCoords, type GanttHitTarget } from '@/features/schedule/gantt/hit-test';
import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import type { Timescale } from '@/features/schedule/gantt/timescale';
import { MINUTES_PER_DAY, ymdFromCivilDays } from '@/lib/civil-date';

export type GanttInteractionOverlay =
  | {
      kind: 'bar-ghost';
      mode: 'bar-move' | 'bar-resize' | 'bar-progress';
      rowIndex: number;
      startMinute: number;
      finishMinute: number;
      progressMinute: number | null;
      badgeLabel: string;
    }
  | {
      kind: 'link-draw';
      sourceRowIndex: number;
      sourcePort: 'start' | 'finish';
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      targetRowIndex: number | null;
      targetPort: 'start' | 'finish' | null;
      relType: RelationshipType | null;
    };

export interface GanttDragState {
  mode: 'bar-move' | 'bar-resize' | 'bar-progress' | 'link-draw';
  activityId: string;
  rowKey: string;
  rowIndex: number;
  startX: number;
  startY: number;
  moved: boolean;
  hoursPerDay: number;
  initialStart: number;
  initialFinish: number;
  snappedStart: number;
  snappedFinish: number;
  newDurationMinutes: number;
  percentComplete: number;
  sourcePort: 'start' | 'finish';
  targetActivityId: string | null;
  targetRowIndex: number | null;
  targetPort: 'start' | 'finish' | null;
  relType: RelationshipType | null;
  overlay: GanttInteractionOverlay;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDayDmy(dayIndex: number): string {
  const { year, month, day } = ymdFromCivilDays(dayIndex);
  return `${pad2(day)}.${pad2(month)}.${String(year).padStart(4, '0')}`;
}

function formatDayClock08(dayIndex: number): string {
  const { year, month, day } = ymdFromCivilDays(dayIndex);
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}T08:00`;
}

export function mapPortsToRelationshipType(
  sourcePort: 'start' | 'finish',
  targetPort: 'start' | 'finish',
): RelationshipType {
  if (sourcePort === 'finish' && targetPort === 'start') return 'FS';
  if (sourcePort === 'start' && targetPort === 'start') return 'SS';
  if (sourcePort === 'finish' && targetPort === 'finish') return 'FF';
  return 'SF';
}

/**
 * Starts a pure Gantt drag state machine from a hit target in Edit mode (spec §5.2, S4, V3).
 */
export function startGanttDrag(
  target: GanttHitTarget,
  pointerX: number,
  pointerY: number,
  options: { hoursPerDay?: number } = {},
): GanttDragState | null {
  if (target.kind === 'bar-select') return null;
  if (!target.row.key.startsWith('act:')) return null;
  const activityId = target.row.key.slice(4);
  const startMin = target.row.start ?? target.row.finish;
  const finishMin = target.row.finish ?? target.row.start;
  if (startMin === null || finishMin === null) return null;

  const hoursPerDay = options.hoursPerDay && options.hoursPerDay > 0 ? options.hoursPerDay : 8;
  const startDay = Math.floor(startMin / MINUTES_PER_DAY);
  const endDay = Math.max(startDay + 1, Math.round(finishMin / MINUTES_PER_DAY));
  const initialDays = Math.max(1, endDay - startDay);
  const initialDuration = initialDays * hoursPerDay * 60;
  const span = Math.max(1, finishMin - startMin);
  const initialPct =
    target.row.progressFinish !== null
      ? Math.max(
          0,
          Math.min(100, Math.round(((target.row.progressFinish - startMin) / span) * 100)),
        )
      : 0;

  if (target.kind === 'link-port-start' || target.kind === 'link-port-finish') {
    const sourcePort = target.kind === 'link-port-start' ? 'start' : 'finish';
    const fromX = target.portX ?? pointerX;
    const fromY = target.portY ?? pointerY;
    return {
      mode: 'link-draw',
      activityId,
      rowKey: target.row.key,
      rowIndex: target.rowIndex,
      startX: pointerX,
      startY: pointerY,
      moved: false,
      hoursPerDay,
      initialStart: startMin,
      initialFinish: finishMin,
      snappedStart: startMin,
      snappedFinish: finishMin,
      newDurationMinutes: initialDuration,
      percentComplete: initialPct,
      sourcePort,
      targetActivityId: null,
      targetRowIndex: null,
      targetPort: null,
      relType: null,
      overlay: {
        kind: 'link-draw',
        sourceRowIndex: target.rowIndex,
        sourcePort,
        fromX,
        fromY,
        toX: pointerX,
        toY: pointerY,
        targetRowIndex: null,
        targetPort: null,
        relType: null,
      },
    };
  }

  const mode = target.kind;
  const badgeLabel =
    mode === 'bar-move'
      ? formatDayDmy(startDay)
      : mode === 'bar-resize'
        ? `${initialDays} d`
        : `${initialPct}%`;

  return {
    mode,
    activityId,
    rowKey: target.row.key,
    rowIndex: target.rowIndex,
    startX: pointerX,
    startY: pointerY,
    moved: false,
    hoursPerDay,
    initialStart: startMin,
    initialFinish: finishMin,
    snappedStart: startMin,
    snappedFinish: finishMin,
    newDurationMinutes: initialDuration,
    percentComplete: initialPct,
    sourcePort: 'finish',
    targetActivityId: null,
    targetRowIndex: null,
    targetPort: null,
    relType: null,
    overlay: {
      kind: 'bar-ghost',
      mode,
      rowIndex: target.rowIndex,
      startMinute: startMin,
      finishMinute: finishMin,
      progressMinute: target.row.progressFinish,
      badgeLabel,
    },
  };
}

/**
 * Updates an active Gantt drag state and computes the live interaction overlay (spec §5.2).
 */
export function updateGanttDrag(
  state: GanttDragState,
  pointerX: number,
  pointerY: number,
  rows: readonly GanttRow[],
  timescale: Timescale,
  scrollLeft: number,
  scrollTop: number,
): GanttDragState {
  const moved = state.moved || Math.hypot(pointerX - state.startX, pointerY - state.startY) > 2;

  if (state.mode === 'bar-move') {
    const deltaMinutes =
      timescale.minuteAt(scrollLeft + pointerX) - timescale.minuteAt(scrollLeft + state.startX);
    const deltaDays = Math.round(deltaMinutes / MINUTES_PER_DAY);
    const initialStartDay = Math.floor(state.initialStart / MINUTES_PER_DAY);
    const snappedDay = initialStartDay + deltaDays;
    const snappedStart = snappedDay * MINUTES_PER_DAY + 8 * 60;
    const span = Math.max(0, state.initialFinish - state.initialStart);
    const snappedFinish = snappedStart + span;
    const progressOffset =
      state.percentComplete > 0 ? Math.round((span * state.percentComplete) / 100) : null;
    return {
      ...state,
      moved,
      snappedStart,
      snappedFinish,
      overlay: {
        kind: 'bar-ghost',
        mode: 'bar-move',
        rowIndex: state.rowIndex,
        startMinute: snappedStart,
        finishMinute: snappedFinish,
        progressMinute: progressOffset !== null ? snappedStart + progressOffset : null,
        badgeLabel: formatDayDmy(snappedDay),
      },
    };
  }

  if (state.mode === 'bar-resize') {
    const pointerMinute = timescale.minuteAt(scrollLeft + pointerX);
    const startDay = Math.floor(state.initialStart / MINUTES_PER_DAY);
    const endDay = Math.max(startDay + 1, Math.round(pointerMinute / MINUTES_PER_DAY));
    const workingDays = Math.max(1, endDay - startDay);
    const newDurationMinutes = workingDays * state.hoursPerDay * 60;
    const snappedFinish = (startDay + workingDays) * MINUTES_PER_DAY;
    return {
      ...state,
      moved,
      snappedFinish,
      newDurationMinutes,
      overlay: {
        kind: 'bar-ghost',
        mode: 'bar-resize',
        rowIndex: state.rowIndex,
        startMinute: state.initialStart,
        finishMinute: snappedFinish,
        progressMinute:
          state.percentComplete > 0
            ? state.initialStart +
              Math.round(((snappedFinish - state.initialStart) * state.percentComplete) / 100)
            : null,
        badgeLabel: `${workingDays} d`,
      },
    };
  }

  if (state.mode === 'bar-progress') {
    const x1 = timescale.x(state.initialStart) - scrollLeft;
    const x2 = timescale.x(state.initialFinish) - scrollLeft;
    const barWidth = Math.max(4, x2 - x1);
    const pct = Math.max(0, Math.min(100, Math.round(((pointerX - x1) / barWidth) * 100)));
    const progressMinute =
      pct > 0
        ? state.initialStart + Math.round(((state.initialFinish - state.initialStart) * pct) / 100)
        : null;
    return {
      ...state,
      moved,
      percentComplete: pct,
      overlay: {
        kind: 'bar-ghost',
        mode: 'bar-progress',
        rowIndex: state.rowIndex,
        startMinute: state.initialStart,
        finishMinute: state.initialFinish,
        progressMinute,
        badgeLabel: `${pct}%`,
      },
    };
  }

  // link-draw
  const sourceRow = rows[state.rowIndex];
  const sourceCoords = sourceRow
    ? getGanttPortCoords(
        sourceRow,
        state.rowIndex,
        state.sourcePort,
        timescale,
        scrollLeft,
        scrollTop,
      )
    : null;
  const fromX = sourceCoords?.x ?? state.startX;
  const fromY = sourceCoords?.y ?? state.startY;

  let targetActivityId: string | null = null;
  let targetRowIndex: number | null = null;
  let targetPort: 'start' | 'finish' | null = null;
  let relType: RelationshipType | null = null;
  let toX = pointerX;
  let toY = pointerY;

  if (pointerY >= 0 && rows.length > 0) {
    const candidateIdx = Math.floor((pointerY + scrollTop) / GANTT_ROW_HEIGHT);
    const candidate =
      candidateIdx >= 0 && candidateIdx < rows.length ? rows[candidateIdx] : undefined;
    if (
      candidate &&
      candidate.key !== state.rowKey &&
      candidate.kind === 'activity' &&
      candidate.key.startsWith('act:') &&
      candidate.activityType !== 'wbs_summary' &&
      candidate.activityType !== 'level_of_effort'
    ) {
      const startCoords = getGanttPortCoords(
        candidate,
        candidateIdx,
        'start',
        timescale,
        scrollLeft,
        scrollTop,
      );
      const finishCoords = getGanttPortCoords(
        candidate,
        candidateIdx,
        'finish',
        timescale,
        scrollLeft,
        scrollTop,
      );
      if (
        startCoords &&
        finishCoords &&
        pointerX >= startCoords.x - 24 &&
        pointerX <= finishCoords.x + 24
      ) {
        const distStart = Math.abs(pointerX - startCoords.x);
        const distFinish = Math.abs(pointerX - finishCoords.x);
        targetPort = distStart <= distFinish ? 'start' : 'finish';
        const snappedPort = targetPort === 'start' ? startCoords : finishCoords;
        toX = snappedPort.x;
        toY = snappedPort.y;
        targetRowIndex = candidateIdx;
        targetActivityId = candidate.key.slice(4);
        relType = mapPortsToRelationshipType(state.sourcePort, targetPort);
      }
    }
  }

  return {
    ...state,
    moved,
    targetActivityId,
    targetRowIndex,
    targetPort,
    relType,
    overlay: {
      kind: 'link-draw',
      sourceRowIndex: state.rowIndex,
      sourcePort: state.sourcePort,
      fromX,
      fromY,
      toX,
      toY,
      targetRowIndex,
      targetPort,
      relType,
    },
  };
}

/**
 * Commits an active Gantt drag state into a single undoable {@link ScheduleCommand}, or `null` if
 * the drag did not move or was dropped on an invalid target (spec §5.2, S4, V3).
 * A progress drop commits `setPercentComplete`, so it follows the one progress helper that keeps
 * status and actual dates consistent and keeps the activity's % type (P4 core D13).
 */
export function commitGanttDrag(state: GanttDragState): ScheduleCommand | null {
  if (!state.moved) return null;

  if (state.mode === 'bar-move') {
    const startDay = Math.floor(state.snappedStart / MINUTES_PER_DAY);
    return {
      type: 'updateActivity',
      activityId: state.activityId,
      changes: {
        constraint: {
          type: 'start_on_or_after',
          date: formatDayClock08(startDay),
        },
      },
    };
  }

  if (state.mode === 'bar-resize') {
    return {
      type: 'updateActivity',
      activityId: state.activityId,
      changes: {
        originalDuration: state.newDurationMinutes,
        remainingDuration: state.newDurationMinutes,
      },
    };
  }

  if (state.mode === 'bar-progress') {
    return {
      type: 'setPercentComplete',
      activityId: state.activityId,
      percentComplete: state.percentComplete,
    };
  }

  if (!state.targetActivityId || !state.relType || state.targetActivityId === state.activityId) {
    return null;
  }

  return {
    type: 'addRelationship',
    predecessorId: state.activityId,
    successorId: state.targetActivityId,
    relType: state.relType,
    lagMinutes: 0,
    lagElapsed: false,
  };
}
