import type {
  ActivityType,
  ComputedScheduleSummary,
  ComputedWbsRollup,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleRelationship,
  ScheduleWbsNode,
  WallClock,
} from '@/data/schedule-types';
import { formatPredecessorCell } from '@/features/schedule/predecessor-text';

export const SCHEDULE_ROW_HEIGHT = 32;
export const SCHEDULE_HEADER_HEIGHT = 44;

export interface VisibleRow {
  key: string; // 'wbs:{id}' | 'act:{id}'
  kind: 'wbs' | 'activity';
  depth: number;
  rowIndex: number; // 1-based for aria-rowindex
  id: string;
  parentWbsId: string | null;
  code: string;
  name: string;
  activityType: ActivityType | null;
  durationMinutes: number | null;
  hoursPerDay: number;
  start: WallClock | null;
  finish: WallClock | null;
  totalFloat: number | null;
  percentComplete: number | null;
  predecessorsLabel: string;
  isCritical: boolean;
  isNearCritical: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
}

function activityPercent(act: ScheduleActivity): number | null {
  if (act.percent.type === 'physical') {
    return act.percent.physical ?? act.percent.duration;
  }
  return act.percent.duration ?? act.percent.physical;
}

function compareByOrderAndCode(
  a: { order: number; code: string },
  b: { order: number; code: string },
): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.code.localeCompare(b.code);
}

/**
 * Flattens the schedule's WBS hierarchy and activities into visible table/Gantt rows, respecting
 * collapsed WBS nodes, `displayMode` (`'as_imported'` vs `'calculated'`), and optional
 * ancestor-preserving activity filtering (spec §7.2).
 */
export function buildVisibleRows(
  document: ScheduleDocument,
  summary: ComputedScheduleSummary | null,
  rollups: Record<string, ComputedWbsRollup>,
  collapsedWbsIds: ReadonlySet<string>,
  filterActivityIds?: ReadonlySet<string> | null,
): VisibleRow[] {
  const calendarsById = new Map(document.calendars.map((c) => [c.id, c]));
  const defaultCal =
    calendarsById.get(document.settings.defaultCalendarId) ?? document.calendars[0];
  const defaultHoursPerDay = defaultCal?.hoursPerDay ?? 8;

  const wbsById = new Map(document.wbs.map((w) => [w.id, w]));
  const activitiesById = new Map(document.activities.map((a) => [a.id, a]));

  const incomingBySucc = new Map<string, ScheduleRelationship[]>();
  for (const rel of document.relationships) {
    const bucket = incomingBySucc.get(rel.successorId);
    if (bucket) bucket.push(rel);
    else incomingBySucc.set(rel.successorId, [rel]);
  }

  let allowedWbsIds: Set<string> | null = null;
  if (filterActivityIds !== undefined && filterActivityIds !== null) {
    allowedWbsIds = new Set<string>();
    for (const act of document.activities) {
      if (!filterActivityIds.has(act.id)) continue;
      let cursor = act.wbsId;
      while (cursor !== null) {
        if (allowedWbsIds.has(cursor)) break;
        allowedWbsIds.add(cursor);
        cursor = wbsById.get(cursor)?.parentId ?? null;
      }
    }
  }

  const childWbs = new Map<string | null, ScheduleWbsNode[]>();
  for (const node of document.wbs) {
    if (allowedWbsIds !== null && !allowedWbsIds.has(node.id)) continue;
    const parentKey = node.parentId !== null && wbsById.has(node.parentId) ? node.parentId : null;
    const bucket = childWbs.get(parentKey);
    if (bucket) bucket.push(node);
    else childWbs.set(parentKey, [node]);
  }
  for (const list of childWbs.values()) {
    list.sort(compareByOrderAndCode);
  }

  const actsByWbs = new Map<string | null, ScheduleActivity[]>();
  for (const act of document.activities) {
    if (
      filterActivityIds !== undefined &&
      filterActivityIds !== null &&
      !filterActivityIds.has(act.id)
    ) {
      continue;
    }
    const wbsKey = act.wbsId !== null && wbsById.has(act.wbsId) ? act.wbsId : null;
    const bucket = actsByWbs.get(wbsKey);
    if (bucket) bucket.push(act);
    else actsByWbs.set(wbsKey, [act]);
  }
  for (const list of actsByWbs.values()) {
    list.sort(compareByOrderAndCode);
  }

  const rows: VisibleRow[] = [];
  const useCalculated = document.settings.displayMode === 'calculated' && summary !== null;

  const pushActivity = (act: ScheduleActivity, depth: number, parentWbsId: string | null) => {
    const cal = calendarsById.get(act.calendarId) ?? defaultCal;
    const hoursPerDay = cal?.hoursPerDay ?? defaultHoursPerDay;
    const computed = useCalculated ? summary.activities[act.id] : undefined;

    let start: WallClock | null;
    let finish: WallClock | null;
    let totalFloat: number | null;
    let isCritical: boolean;
    let isNearCritical: boolean;

    if (computed !== undefined) {
      start = computed.earlyStart;
      finish = computed.earlyFinish;
      totalFloat = computed.totalFloat;
      isCritical = computed.isCritical;
      isNearCritical = computed.isNearCritical;
    } else {
      start =
        act.sourceDates?.early.start ?? act.sourceDates?.planned.start ?? act.actualStart ?? null;
      finish =
        act.sourceDates?.early.finish ??
        act.sourceDates?.planned.finish ??
        act.actualFinish ??
        null;
      totalFloat = act.sourceDates?.totalFloat ?? null;
      isCritical = totalFloat !== null && totalFloat <= document.settings.criticalThresholdMinutes;
      isNearCritical =
        !isCritical &&
        totalFloat !== null &&
        totalFloat <= document.settings.nearCriticalThresholdMinutes;
    }

    rows.push({
      key: `act:${act.id}`,
      kind: 'activity',
      depth,
      rowIndex: rows.length + 1,
      id: act.id,
      parentWbsId,
      code: act.code,
      name: act.name,
      activityType: act.type,
      durationMinutes: act.originalDuration,
      hoursPerDay,
      start,
      finish,
      totalFloat,
      percentComplete: activityPercent(act),
      predecessorsLabel: formatPredecessorCell(
        incomingBySucc.get(act.id) ?? [],
        act.id,
        activitiesById,
        hoursPerDay,
      ),
      isCritical,
      isNearCritical,
      hasChildren: false,
      isCollapsed: false,
    });
  };

  interface Frame {
    wbs: ScheduleWbsNode;
    depth: number;
  }
  const stack: Frame[] = [];
  const rootWbs = childWbs.get(null) ?? [];
  for (let i = rootWbs.length - 1; i >= 0; i--) {
    stack.push({ wbs: rootWbs[i]!, depth: 0 });
  }

  while (stack.length > 0) {
    const { wbs, depth } = stack.pop()!;
    const wbsChildren = childWbs.get(wbs.id) ?? [];
    const directActs = actsByWbs.get(wbs.id) ?? [];
    const hasChildren = wbsChildren.length > 0 || directActs.length > 0;
    const isCollapsed = collapsedWbsIds.has(wbs.id);
    const rollup = rollups[wbs.id];

    rows.push({
      key: `wbs:${wbs.id}`,
      kind: 'wbs',
      depth,
      rowIndex: rows.length + 1,
      id: wbs.id,
      parentWbsId: wbs.parentId !== null && wbsById.has(wbs.parentId) ? wbs.parentId : null,
      code: wbs.code,
      name: wbs.name,
      activityType: null,
      durationMinutes: rollup ? rollup.durationMinutes : null,
      hoursPerDay: defaultHoursPerDay,
      start: rollup?.start ?? null,
      finish: rollup?.finish ?? null,
      totalFloat: null,
      percentComplete: rollup?.percentComplete ?? null,
      predecessorsLabel: '',
      isCritical: rollup?.hasCritical ?? false,
      isNearCritical: false,
      hasChildren,
      isCollapsed,
    });

    if (isCollapsed) continue;

    for (const act of directActs) {
      pushActivity(act, depth + 1, wbs.id);
    }
    for (let i = wbsChildren.length - 1; i >= 0; i--) {
      stack.push({ wbs: wbsChildren[i]!, depth: depth + 1 });
    }
  }

  const rootActs = actsByWbs.get(null) ?? [];
  for (const act of rootActs) {
    pushActivity(act, 0, null);
  }

  return rows;
}
