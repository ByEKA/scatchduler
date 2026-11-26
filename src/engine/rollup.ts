import type {
  ComputedScheduleSummary,
  ComputedWbsRollup,
  ScheduleActivity,
  ScheduleDocument,
} from '@/data/schedule-types';
import {
  compileCalendar,
  ELAPSED_CALENDAR,
  workingMinutesBetween,
  type CompiledCalendar,
} from '@/engine/calendar';
import { toMinutes, toWallClock } from '@/engine/time';

interface WbsAcc {
  minStart: number | null;
  maxFinish: number | null;
  weightedDone: number;
  totalDuration: number;
  milestoneCount: number;
  completedMilestoneCount: number;
  activityCount: number;
  hasCritical: boolean;
}

function emptyAcc(): WbsAcc {
  return {
    minStart: null,
    maxFinish: null,
    weightedDone: 0,
    totalDuration: 0,
    milestoneCount: 0,
    completedMilestoneCount: 0,
    activityCount: 0,
    hasCritical: false,
  };
}

function activityPercent(act: ScheduleActivity): number {
  if (act.status === 'completed') return 100;
  if (act.status === 'not_started') return 0;
  const raw = act.percent.duration ?? act.percent.physical ?? 0;
  return Math.max(0, Math.min(100, raw));
}

function resolveDefaultCalendar(document: ScheduleDocument): CompiledCalendar {
  const cal =
    document.calendars.find((c) => c.id === document.settings.defaultCalendarId) ??
    document.calendars[0];
  if (!cal) return ELAPSED_CALENDAR;
  const compiled = compileCalendar(cal);
  return 'code' in compiled ? ELAPSED_CALENDAR : compiled;
}

/**
 * Computes bottom-up WBS rollups iteratively across the WBS tree (spec §5.4 step 5).
 * Respects `displayMode` (`'as_imported'` vs `'calculated'`) without mutating `document`.
 */
export function rollup(
  document: ScheduleDocument,
  summary: ComputedScheduleSummary | null,
): Record<string, ComputedWbsRollup> {
  const wbsCount = document.wbs.length;
  if (wbsCount === 0) return {};

  const indexById = new Map<string, number>();
  const children: number[][] = Array.from({ length: wbsCount }, () => []);
  const parentIndex = new Int32Array(wbsCount);
  parentIndex.fill(-1);

  for (let i = 0; i < wbsCount; i++) {
    indexById.set(document.wbs[i]!.id, i);
  }
  for (let i = 0; i < wbsCount; i++) {
    const pid = document.wbs[i]!.parentId;
    if (pid !== null) {
      const pIdx = indexById.get(pid);
      if (pIdx !== undefined && pIdx !== i) {
        parentIndex[i] = pIdx;
        children[pIdx]!.push(i);
      }
    }
  }

  // Accumulate direct activity metrics per WBS node.
  const accs: WbsAcc[] = Array.from({ length: wbsCount }, () => emptyAcc());
  const useCalculated = document.settings.displayMode === 'calculated' && summary !== null;
  const critThreshold = document.settings.criticalThresholdMinutes;

  for (let i = 0; i < document.activities.length; i++) {
    const act = document.activities[i]!;
    if (act.type === 'wbs_summary' || act.wbsId === null) continue;
    const wIdx = indexById.get(act.wbsId);
    if (wIdx === undefined) continue;
    const acc = accs[wIdx]!;

    let startWc: string | null;
    let finishWc: string | null;
    let isCritical: boolean;

    if (useCalculated) {
      const comp = summary.activities[act.id];
      startWc = comp?.earlyStart ?? null;
      finishWc = comp?.earlyFinish ?? null;
      isCritical = comp?.isCritical ?? false;
    } else {
      startWc =
        act.actualStart ?? act.sourceDates?.early.start ?? act.sourceDates?.planned.start ?? null;
      finishWc =
        act.actualFinish ??
        act.sourceDates?.early.finish ??
        act.sourceDates?.planned.finish ??
        null;
      isCritical =
        act.sourceDates?.totalFloat !== null &&
        act.sourceDates?.totalFloat !== undefined &&
        act.sourceDates.totalFloat <= critThreshold;
    }

    if (startWc !== null) {
      const startMin = toMinutes(startWc);
      if (acc.minStart === null || startMin < acc.minStart) {
        acc.minStart = startMin;
      }
    }
    if (finishWc !== null) {
      const finishMin = toMinutes(finishWc);
      if (acc.maxFinish === null || finishMin > acc.maxFinish) {
        acc.maxFinish = finishMin;
      }
    }

    const dur = Math.max(0, act.originalDuration);
    const pct = activityPercent(act);
    if (dur > 0) {
      acc.totalDuration += dur;
      acc.weightedDone += dur * pct;
    } else if (act.type === 'start_milestone' || act.type === 'finish_milestone') {
      acc.milestoneCount += 1;
      if (act.status === 'completed') {
        acc.completedMilestoneCount += 1;
      }
    }

    acc.activityCount += 1;
    // D11: completed work never makes a WBS element critical, in either display mode (this also
    // covers stored summaries computed before completed activities stopped being critical).
    if (isCritical && act.status !== 'completed') acc.hasCritical = true;
  }

  // Iterative post-order traversal over the WBS forest (cycle-safe via visited array).
  const visited = new Uint8Array(wbsCount);
  const postOrder: number[] = [];
  const stackNode: number[] = [];
  const stackExpanded: boolean[] = [];

  for (let i = 0; i < wbsCount; i++) {
    if (parentIndex[i] !== -1 || visited[i] === 1) continue;
    stackNode.push(i);
    stackExpanded.push(false);
    while (stackNode.length > 0) {
      const node = stackNode.pop()!;
      const expanded = stackExpanded.pop()!;
      if (expanded) {
        postOrder.push(node);
        continue;
      }
      if (visited[node] === 1) continue;
      visited[node] = 1;
      stackNode.push(node);
      stackExpanded.push(true);
      const kids = children[node]!;
      for (let k = kids.length - 1; k >= 0; k--) {
        const child = kids[k]!;
        if (visited[child] === 0) {
          stackNode.push(child);
          stackExpanded.push(false);
        }
      }
    }
  }

  // Handle any disconnected cycle component defensively so every WBS id gets a rollup entry.
  for (let i = 0; i < wbsCount; i++) {
    if (visited[i] === 0) {
      visited[i] = 1;
      postOrder.push(i);
    }
  }

  for (let idx = 0; idx < postOrder.length; idx++) {
    const node = postOrder[idx]!;
    const pIdx = parentIndex[node]!;
    if (pIdx === -1) continue;
    const child = accs[node]!;
    const parent = accs[pIdx]!;

    if (child.minStart !== null && (parent.minStart === null || child.minStart < parent.minStart)) {
      parent.minStart = child.minStart;
    }
    if (
      child.maxFinish !== null &&
      (parent.maxFinish === null || child.maxFinish > parent.maxFinish)
    ) {
      parent.maxFinish = child.maxFinish;
    }
    parent.weightedDone += child.weightedDone;
    parent.totalDuration += child.totalDuration;
    parent.milestoneCount += child.milestoneCount;
    parent.completedMilestoneCount += child.completedMilestoneCount;
    parent.activityCount += child.activityCount;
    if (child.hasCritical) parent.hasCritical = true;
  }

  const defaultCal = resolveDefaultCalendar(document);
  const result: Record<string, ComputedWbsRollup> = {};
  for (let i = 0; i < wbsCount; i++) {
    const wbsNode = document.wbs[i]!;
    const acc = accs[i]!;
    const durationMinutes =
      acc.minStart !== null && acc.maxFinish !== null
        ? Math.max(0, workingMinutesBetween(defaultCal, acc.minStart, acc.maxFinish))
        : 0;
    let percentComplete: number | null;
    if (acc.totalDuration > 0) {
      percentComplete = Math.round((acc.weightedDone / acc.totalDuration) * 10) / 10;
    } else if (acc.completedMilestoneCount > 0 && acc.milestoneCount > 0) {
      percentComplete = Math.round((acc.completedMilestoneCount / acc.milestoneCount) * 1000) / 10;
    } else {
      percentComplete = null;
    }

    result[wbsNode.id] = {
      start: acc.minStart !== null ? toWallClock(acc.minStart) : null,
      finish: acc.maxFinish !== null ? toWallClock(acc.maxFinish) : null,
      durationMinutes,
      percentComplete,
      activityCount: acc.activityCount,
      hasCritical: acc.hasCritical,
    };
  }

  return result;
}
