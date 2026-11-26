import type {
  RelationshipType,
  ScheduleCalendar,
  ScheduleCalendarPeriod,
} from '@/data/schedule-types';
import type { ScheduleCommand } from '@/features/schedule/commands';
import { getGanttPortCoords, type GanttHitTarget } from '@/features/schedule/gantt/hit-test';
import { GANTT_ROW_HEIGHT, type GanttRow } from '@/features/schedule/gantt/renderer';
import type { Timescale } from '@/features/schedule/gantt/timescale';
import {
  dayOfWeekFromDays,
  MINUTES_PER_DAY,
  wallClockToCivilMinutes,
  ymdFromCivilDays,
} from '@/lib/civil-date';

/** No working-day scan walks more days than this, so a calendar without working days cannot hang a drag. */
const MAX_SCAN_DAYS = 3660;

/** Minutes after midnight at which the fallback (and the standard) calendar's working day starts. */
const DEFAULT_DAY_START = 8 * 60;

/** The fallback working day, the same as the standard calendar's: 08:00–12:00 and 13:00–17:00. */
const DEFAULT_WORKDAY: readonly ScheduleCalendarPeriod[] = [
  { start: DEFAULT_DAY_START, finish: 12 * 60 },
  { start: 13 * 60, finish: 17 * 60 },
];

/**
 * Working-day view of one activity calendar for Gantt drag snapping (P4 later spec §5.2). `day` is
 * a civil day index as in `civilDaysFromYmd`. Kept here because `src/features/**` must not import
 * engine runtime code (CLAUDE.md rule 9).
 */
export interface GanttWorkDays {
  isWorkingDay(day: number): boolean;
  /** Minutes after midnight at which the day's first working period starts. */
  dayStartOffset(day: number): number;
  /** The day's working periods in minutes after midnight, sorted and merged as the engine does. */
  periods(day: number): readonly ScheduleCalendarPeriod[];
}

export interface GanttDragOptions {
  hoursPerDay?: number;
  /** The activity's own calendar; `null` falls back to Mon–Fri from 08:00. */
  calendar?: ScheduleCalendar | null;
  /** The activity's real duration in minutes; the grab badge and a nudge keep it. */
  durationMinutes?: number | null;
}

/**
 * Clips periods to the day, drops empty ones, sorts and merges the rest, as the engine's
 * normalizePeriods does.
 */
function normalizePeriods(
  raw: readonly ScheduleCalendarPeriod[] | undefined,
): readonly ScheduleCalendarPeriod[] {
  const valid: ScheduleCalendarPeriod[] = [];
  for (const p of raw ?? []) {
    const start = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(p.start)));
    const finish = Math.max(0, Math.min(MINUTES_PER_DAY, Math.round(p.finish)));
    if (finish > start) valid.push({ start, finish });
  }
  valid.sort((a, b) => a.start - b.start || a.finish - b.finish);
  const merged: ScheduleCalendarPeriod[] = [];
  for (const p of valid) {
    const prev = merged[merged.length - 1];
    if (prev !== undefined && p.start <= prev.finish) prev.finish = Math.max(prev.finish, p.finish);
    else merged.push(p);
  }
  return merged;
}

/**
 * Builds the working-day view of `calendar`. Without a calendar, Monday to Friday are working days
 * from 08:00 to 12:00 and 13:00 to 17:00, the standard calendar and the same weekdays as the
 * Gantt's weekend shading.
 */
export function createGanttWorkDays(calendar: ScheduleCalendar | null): GanttWorkDays {
  const week = Array.from({ length: 7 }, (_, dow) =>
    normalizePeriods(
      calendar === null ? (dow === 0 || dow === 6 ? [] : DEFAULT_WORKDAY) : calendar.week[dow],
    ),
  );
  // When a date repeats, the last entry wins (like compileCalendar).
  const exceptions = new Map<number, readonly ScheduleCalendarPeriod[]>();
  for (const e of calendar?.exceptions ?? []) {
    const minutes = wallClockToCivilMinutes(e.date);
    if (minutes === null) continue;
    exceptions.set(Math.floor(minutes / MINUTES_PER_DAY), normalizePeriods(e.periods));
  }

  const periods = (day: number): readonly ScheduleCalendarPeriod[] =>
    exceptions.get(day) ?? week[dayOfWeekFromDays(day)] ?? [];

  return {
    isWorkingDay: (day) => periods(day).length > 0,
    dayStartOffset: (day) => periods(day)[0]?.start ?? DEFAULT_DAY_START,
    periods,
  };
}

function nextWorkingDay(work: GanttWorkDays, day: number): number {
  for (let d = day; d < day + MAX_SCAN_DAYS; d++) if (work.isWorkingDay(d)) return d;
  return day;
}
function previousWorkingDay(work: GanttWorkDays, day: number): number {
  for (let d = day; d > day - MAX_SCAN_DAYS; d--) if (work.isWorkingDay(d)) return d;
  return day;
}
/** Working days d with from <= d < to (0 when to <= from). */
function countWorkingDays(work: GanttWorkDays, from: number, to: number): number {
  let n = 0;
  for (let d = from; d < to && d < from + MAX_SCAN_DAYS; d++) if (work.isWorkingDay(d)) n++;
  return n;
}
function signedWorkingDays(work: GanttWorkDays, from: number, to: number): number {
  return to >= from ? countWorkingDays(work, from, to) : -countWorkingDays(work, to, from);
}
/** Moves a finish instant by n working days, keeping its time of day (a 00:00 finish belongs to the day before). */
function shiftFinishByWorkingDays(work: GanttWorkDays, finish: number, n: number): number {
  if (n === 0) return finish;
  const lastDay = Math.ceil(finish / MINUTES_PER_DAY) - 1;
  const timeOfDay = finish - lastDay * MINUTES_PER_DAY; // 1..1440
  let day = previousWorkingDay(work, lastDay);
  const step = n > 0 ? 1 : -1;
  for (let left = Math.abs(n), guard = 0; left > 0 && guard < MAX_SCAN_DAYS; guard++) {
    day += step;
    if (work.isWorkingDay(day)) left--;
  }
  return day * MINUTES_PER_DAY + timeOfDay;
}
/**
 * Advances `minutes` of working time from `start`, ending at the end of the working period where
 * they run out, as the engine's addWorkingMinutes does for early finish = start + duration.
 */
function addWorkMinutes(work: GanttWorkDays, start: number, minutes: number): number {
  if (minutes <= 0) return start;
  let left = minutes;
  const firstDay = Math.floor(start / MINUTES_PER_DAY);
  for (let day = firstDay; day < firstDay + MAX_SCAN_DAYS; day++) {
    const base = day * MINUTES_PER_DAY;
    for (const p of work.periods(day)) {
      const from = Math.max(base + p.start, start);
      const available = base + p.finish - from;
      if (available <= 0) continue;
      if (left <= available) return from + left;
      left -= available;
    }
  }
  return start;
}

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
  /** Working days of the bar when the drag started (its real duration when the caller knows it). */
  initialDays: number;
  /** The bar's real working duration in minutes, or `null` when the caller does not know it. */
  durationMinutes: number | null;
  /** Working-day view of the activity's calendar used for snapping. */
  workDays: GanttWorkDays;
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

/** Formats civil minutes as a `YYYY-MM-DDTHH:mm` wall clock. */
function formatMinuteClock(minute: number): string {
  const dayIndex = Math.floor(minute / MINUTES_PER_DAY);
  const minuteOfDay = minute - dayIndex * MINUTES_PER_DAY;
  const { year, month, day } = ymdFromCivilDays(dayIndex);
  const hh = pad2(Math.floor(minuteOfDay / 60));
  const mm = pad2(minuteOfDay % 60);
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}T${hh}:${mm}`;
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
  options: GanttDragOptions = {},
): GanttDragState | null {
  if (target.kind === 'bar-select') return null;
  if (!target.row.key.startsWith('act:')) return null;
  const activityId = target.row.key.slice(4);
  const startMin = target.row.start ?? target.row.finish;
  const finishMin = target.row.finish ?? target.row.start;
  if (startMin === null || finishMin === null) return null;

  const calendar = options.calendar ?? null;
  const workDays = createGanttWorkDays(calendar);
  const hoursPerDay =
    options.hoursPerDay !== undefined && options.hoursPerDay > 0
      ? options.hoursPerDay
      : calendar !== null && calendar.hoursPerDay > 0
        ? calendar.hoursPerDay
        : 8;
  const startDay = Math.floor(startMin / MINUTES_PER_DAY);
  const durationMinutes =
    typeof options.durationMinutes === 'number' &&
    Number.isFinite(options.durationMinutes) &&
    options.durationMinutes >= 0
      ? options.durationMinutes
      : null;
  const initialDays =
    durationMinutes !== null && durationMinutes > 0
      ? Math.max(1, Math.round(durationMinutes / (hoursPerDay * 60)))
      : Math.max(1, countWorkingDays(workDays, startDay, Math.ceil(finishMin / MINUTES_PER_DAY)));
  // A handle grabbed and released without a working-day change keeps the bar's real duration.
  const initialDuration =
    durationMinutes !== null && durationMinutes > 0
      ? durationMinutes
      : initialDays * hoursPerDay * 60;
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
      initialDays,
      durationMinutes,
      workDays,
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
    initialDays,
    durationMinutes,
    workDays,
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
    const { workDays } = state;
    const initialStartDay = Math.floor(state.initialStart / MINUTES_PER_DAY);
    // Snaps forward to a working day, even when dragging left, as Calculate does with an SNET.
    const snappedDay = nextWorkingDay(workDays, initialStartDay + deltaDays);
    const snappedStart = snappedDay * MINUTES_PER_DAY + workDays.dayStartOffset(snappedDay);
    // The ghost ends where Calculate puts the early finish: the snapped start plus the bar's
    // working duration on the activity's calendar. Milestones keep finish = start.
    const span = Math.max(0, state.initialFinish - state.initialStart);
    const snappedFinish =
      span === 0
        ? snappedStart
        : addWorkMinutes(
            workDays,
            snappedStart,
            state.durationMinutes ?? state.initialDays * state.hoursPerDay * 60,
          );
    const progressMinute =
      state.percentComplete > 0
        ? snappedStart + Math.round(((snappedFinish - snappedStart) * state.percentComplete) / 100)
        : null;
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
        progressMinute,
        badgeLabel: formatDayDmy(snappedDay),
      },
    };
  }

  if (state.mode === 'bar-resize') {
    // Anchored to the grab: only the horizontal movement since pointer-down moves the finish
    // boundary, so a grab anywhere in the handle and any vertical jitter keep the duration.
    const deltaMinutes =
      timescale.minuteAt(scrollLeft + pointerX) - timescale.minuteAt(scrollLeft + state.startX);
    const finishBoundary = Math.ceil(state.initialFinish / MINUTES_PER_DAY);
    const pointerBoundary = finishBoundary + Math.round(deltaMinutes / MINUTES_PER_DAY);
    const addedDays = signedWorkingDays(state.workDays, finishBoundary, pointerBoundary);
    const workingDays = Math.max(1, state.initialDays + addedDays);
    const newDurationMinutes =
      addedDays === 0 && state.durationMinutes !== null && state.durationMinutes > 0
        ? state.durationMinutes
        : workingDays * state.hoursPerDay * 60;
    const snappedFinish = shiftFinishByWorkingDays(
      state.workDays,
      state.initialFinish,
      workingDays - state.initialDays,
    );
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
    return {
      type: 'updateActivity',
      activityId: state.activityId,
      changes: {
        constraint: {
          type: 'start_on_or_after',
          date: formatMinuteClock(state.snappedStart),
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
