import type {
  ComputedActivityResult,
  ComputedRelationshipResult,
  ConstraintType,
  DriverReason,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleRelationship,
  ScheduleSettings,
  SolverWarning,
} from '@/data/schedule-types';
import {
  addWorkingMinutes,
  ELAPSED_CALENDAR,
  snapBackwardToWorkFinish,
  snapForwardToWorkStart,
  subtractWorkingMinutes,
  workingMinutesBetween,
  type CompiledCalendar,
} from '@/engine/calendar';
import type { ScheduleGraph } from '@/engine/graph';
import type { ResolvedRules } from '@/engine/profiles';
import { toMinutes, toWallClock } from '@/engine/time';

export interface ForwardState {
  readonly projectStart: number;
  readonly es: Int32Array;
  readonly ef: Int32Array;
  readonly drivers: DriverReason[];
  readonly warnings: SolverWarning[];
  /** 1 = active in forward logic; 0 = ignored by progress_override. */
  readonly activeLinkMask: Uint8Array;
}

const DEFAULT_EPOCH_START = toMinutes('1970-01-01T08:00');

export function resolveLagCalendar(
  rel: ScheduleRelationship,
  settings: ScheduleSettings,
  predCal: CompiledCalendar,
  succCal: CompiledCalendar,
  defaultCal: CompiledCalendar,
): CompiledCalendar {
  if (rel.lagElapsed) return ELAPSED_CALENDAR;
  switch (settings.lagCalendar) {
    case 'predecessor':
      return predCal;
    case 'successor':
      return succCal;
    case 'elapsed_24h':
      return ELAPSED_CALENDAR;
    case 'project_default':
      return defaultCal;
  }
}

export function resolveDefaultCalendar(
  settings: ScheduleSettings,
  calendars: ReadonlyMap<string, CompiledCalendar>,
): CompiledCalendar {
  const explicit = calendars.get(settings.defaultCalendarId);
  if (explicit) return explicit;
  const first = calendars.values().next().value;
  return first ?? ELAPSED_CALENDAR;
}

export function resolveNodeCalendars(
  nodes: readonly ScheduleActivity[],
  calendars: ReadonlyMap<string, CompiledCalendar>,
  defaultCal: CompiledCalendar,
): CompiledCalendar[] {
  const resolved = new Array<CompiledCalendar>(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    const act = nodes[i]!;
    if (act.flags.elapsed) {
      resolved[i] = ELAPSED_CALENDAR;
    } else {
      resolved[i] = calendars.get(act.calendarId) ?? defaultCal;
    }
  }
  return resolved;
}

function resolveProjectStart(document: ScheduleDocument, nodes: readonly ScheduleActivity[]): number {
  if (document.settings.projectStart !== null) {
    return toMinutes(document.settings.projectStart);
  }
  if (document.settings.statusDate !== null) {
    return toMinutes(document.settings.statusDate);
  }
  let earliest = Number.POSITIVE_INFINITY;
  for (let i = 0; i < nodes.length; i++) {
    const act = nodes[i]!;
    const candidates = [
      act.actualStart,
      act.constraint?.date ?? null,
      act.secondaryConstraint?.date ?? null,
      act.sourceDates?.early.start ?? null,
      act.sourceDates?.planned.start ?? null,
    ];
    for (const c of candidates) {
      if (c !== null) {
        const m = toMinutes(c);
        if (m < earliest) earliest = m;
      }
    }
  }
  return Number.isFinite(earliest) ? earliest : DEFAULT_EPOCH_START;
}

function isOutOfSequence(
  rel: ScheduleRelationship,
  pred: ScheduleActivity,
  predEs: number,
  predEf: number,
  succ: ScheduleActivity,
  succActualStart: number | null,
  succActualFinish: number | null,
): boolean {
  switch (rel.type) {
    case 'FS':
      return pred.status !== 'completed' || (succActualStart !== null && predEf > succActualStart);
    case 'SS':
      return pred.status === 'not_started' || (succActualStart !== null && predEs > succActualStart);
    case 'FF':
      return (
        succ.status === 'completed' &&
        (pred.status !== 'completed' || (succActualFinish !== null && predEf > succActualFinish))
      );
    case 'SF':
      return succ.status === 'completed' && pred.status === 'not_started';
  }
}

function applyForwardConstraint(
  c: { type: ConstraintType; date: string | null } | null,
  cal: CompiledCalendar,
  remDur: number,
  isStartMs: boolean,
  isFinishMs: boolean,
  currentEs: number,
  currentDriver: DriverReason,
): { es: number; driver: DriverReason } {
  if (!c || c.date === null) return { es: currentEs, driver: currentDriver };
  const cMin = toMinutes(c.date);
  switch (c.type) {
    case 'start_on':
    case 'start_on_or_after': {
      const targetEs = isFinishMs ? cMin : snapForwardToWorkStart(cal, cMin);
      if (targetEs > currentEs) {
        return { es: targetEs, driver: { kind: 'constraint', constraint: c.type } };
      }
      return { es: currentEs, driver: currentDriver };
    }
    case 'finish_on':
    case 'finish_on_or_after': {
      const targetEf = isStartMs
        ? snapForwardToWorkStart(cal, cMin)
        : snapBackwardToWorkFinish(cal, cMin);
      const targetEs = remDur > 0 ? subtractWorkingMinutes(cal, targetEf, remDur) : targetEf;
      if (targetEs > currentEs) {
        return { es: targetEs, driver: { kind: 'constraint', constraint: c.type } };
      }
      return { es: currentEs, driver: currentDriver };
    }
    case 'mandatory_start': {
      const targetEs = isFinishMs ? cMin : snapForwardToWorkStart(cal, cMin);
      return { es: targetEs, driver: { kind: 'constraint', constraint: 'mandatory_start' } };
    }
    case 'mandatory_finish': {
      const targetEf = isStartMs
        ? snapForwardToWorkStart(cal, cMin)
        : snapBackwardToWorkFinish(cal, cMin);
      const targetEs = remDur > 0 ? subtractWorkingMinutes(cal, targetEf, remDur) : targetEf;
      return { es: targetEs, driver: { kind: 'constraint', constraint: 'mandatory_finish' } };
    }
    default:
      return { es: currentEs, driver: currentDriver };
  }
}

function applyInProgressFinishConstraint(
  c: { type: ConstraintType; date: string | null } | null,
  cal: CompiledCalendar,
  currentEf: number,
  currentDriver: DriverReason,
): { ef: number; driver: DriverReason } {
  if (!c || c.date === null) return { ef: currentEf, driver: currentDriver };
  const cMin = toMinutes(c.date);
  switch (c.type) {
    case 'finish_on':
    case 'finish_on_or_after': {
      const targetEf = snapBackwardToWorkFinish(cal, cMin);
      if (targetEf > currentEf) {
        return { ef: targetEf, driver: { kind: 'constraint', constraint: c.type } };
      }
      return { ef: currentEf, driver: currentDriver };
    }
    case 'mandatory_finish': {
      const targetEf = snapBackwardToWorkFinish(cal, cMin);
      return { ef: targetEf, driver: { kind: 'constraint', constraint: 'mandatory_finish' } };
    }
    default:
      return { ef: currentEf, driver: currentDriver };
  }
}

/**
 * Forward pass in topological order (spec §5.4 step 1).
 * Reads `rules.*` exclusively without inspecting profile or source format identifiers.
 */
export function runForwardPass(
  document: ScheduleDocument,
  graph: ScheduleGraph,
  calendars: ReadonlyMap<string, CompiledCalendar>,
  rules: ResolvedRules,
): ForwardState {
  const n = graph.nodes.length;
  const defaultCal = resolveDefaultCalendar(document.settings, calendars);
  const nodeCalendars = resolveNodeCalendars(graph.nodes, calendars, defaultCal);
  const projectStart = resolveProjectStart(document, graph.nodes);
  const statusMin =
    document.settings.statusDate !== null ? toMinutes(document.settings.statusDate) : null;
  const progressOverride = document.settings.progressMode === 'progress_override';

  const es = new Int32Array(n);
  const ef = new Int32Array(n);
  const drivers = new Array<DriverReason>(n);
  const activeLinkMask = new Uint8Array(graph.activeRelationships.length);
  activeLinkMask.fill(1);
  const warnings: SolverWarning[] = [];

  for (let ordIdx = 0; ordIdx < graph.activityOrder.length; ordIdx++) {
    const u = graph.activityOrder[ordIdx]!;
    const act = graph.nodes[u]!;
    const cal = nodeCalendars[u]!;
    const isStartMs = act.type === 'start_milestone';
    const isFinishMs = act.type === 'finish_milestone';
    const isMilestone = isStartMs || isFinishMs;
    const remDur = isMilestone ? 0 : Math.max(0, act.remainingDuration);
    const inEdges = graph.incomingEdgeIndices[u]!;

    if (act.status === 'completed') {
      const actualStartMin = act.actualStart !== null ? toMinutes(act.actualStart) : null;
      const actualFinishMin = act.actualFinish !== null ? toMinutes(act.actualFinish) : null;
      if (actualStartMin === null) {
        warnings.push({
          code: 'MISSING_ACTUAL_DATE',
          activityId: act.id,
          relationshipId: null,
          message: `${act.code} is completed without an actual start date.`,
        });
      }
      if (actualFinishMin === null) {
        warnings.push({
          code: 'MISSING_ACTUAL_DATE',
          activityId: act.id,
          relationshipId: null,
          message: `${act.code} is completed without an actual finish date.`,
        });
      }
      const actEs = actualStartMin ?? projectStart;
      const actEf = actualFinishMin ?? actEs;

      for (let j = 0; j < inEdges.length; j++) {
        const edgeIdx = inEdges[j]!;
        const rel = graph.activeRelationships[edgeIdx]!;
        const p = graph.edgePredIndex[edgeIdx]!;
        const pred = graph.nodes[p]!;
        if (isOutOfSequence(rel, pred, es[p]!, ef[p]!, act, actualStartMin, actualFinishMin)) {
          warnings.push({
            code: 'OUT_OF_SEQUENCE',
            activityId: act.id,
            relationshipId: rel.id,
            message: `${act.code} started out of sequence before ${pred.code}.`,
          });
          if (progressOverride) {
            activeLinkMask[edgeIdx] = 0;
          }
        }
      }

      es[u] = actEs;
      ef[u] = actEf;
      drivers[u] = { kind: 'actual' };
      continue;
    }

    if (act.status === 'in_progress') {
      const actualStartMin = act.actualStart !== null ? toMinutes(act.actualStart) : null;
      if (actualStartMin === null) {
        warnings.push({
          code: 'MISSING_ACTUAL_DATE',
          activityId: act.id,
          relationshipId: null,
          message: `${act.code} is in progress without an actual start date.`,
        });
      }
      const actEs = actualStartMin ?? statusMin ?? projectStart;

      let remStart: number;
      if (rules.inProgressResumeMode === 'p6_remaining_from_status') {
        remStart = statusMin !== null ? statusMin : actEs;
      } else {
        const elapsed = Math.max(0, act.originalDuration - remDur);
        const elapsedPoint =
          elapsed > 0 ? snapForwardToWorkStart(cal, addWorkingMinutes(cal, actEs, elapsed)) : actEs;
        remStart = statusMin !== null ? Math.max(statusMin, elapsedPoint) : elapsedPoint;
      }
      remStart = snapForwardToWorkStart(cal, remStart);

      let driver: DriverReason = { kind: 'actual' };
      let minFinish = Number.NEGATIVE_INFINITY;
      let finishDriver: DriverReason | null = null;

      for (let j = 0; j < inEdges.length; j++) {
        const edgeIdx = inEdges[j]!;
        const rel = graph.activeRelationships[edgeIdx]!;
        const p = graph.edgePredIndex[edgeIdx]!;
        const pred = graph.nodes[p]!;
        const lagCal = resolveLagCalendar(rel, document.settings, nodeCalendars[p]!, cal, defaultCal);

        if (isOutOfSequence(rel, pred, es[p]!, ef[p]!, act, actualStartMin, null)) {
          warnings.push({
            code: 'OUT_OF_SEQUENCE',
            activityId: act.id,
            relationshipId: rel.id,
            message: `${act.code} started out of sequence before ${pred.code}.`,
          });
          if (progressOverride) {
            activeLinkMask[edgeIdx] = 0;
            continue;
          }
        }

        if (rel.type === 'FS' || rel.type === 'SS') {
          const anchor = rel.type === 'FS' ? ef[p]! : es[p]!;
          const raw = addWorkingMinutes(lagCal, anchor, rel.lagMinutes);
          let boundStart = snapForwardToWorkStart(cal, raw);
          if (rel.lagMinutes < 0 && boundStart < projectStart) {
            boundStart = snapForwardToWorkStart(cal, projectStart);
            warnings.push({
              code: 'TRUNCATED_LEAD',
              activityId: act.id,
              relationshipId: rel.id,
              message: `Lead on ${pred.code} → ${act.code} was clamped at the project start.`,
            });
          }
          if (boundStart > remStart) {
            remStart = boundStart;
            driver = { kind: 'predecessor', relationshipId: rel.id, predecessorId: pred.id };
          }
        } else {
          const anchor = rel.type === 'FF' ? ef[p]! : es[p]!;
          const raw = addWorkingMinutes(lagCal, anchor, rel.lagMinutes);
          let boundFinish = snapBackwardToWorkFinish(cal, raw);
          if (rel.lagMinutes < 0 && boundFinish < projectStart) {
            boundFinish = snapBackwardToWorkFinish(cal, projectStart);
            warnings.push({
              code: 'TRUNCATED_LEAD',
              activityId: act.id,
              relationshipId: rel.id,
              message: `Lead on ${pred.code} → ${act.code} was clamped at the project start.`,
            });
          }
          if (boundFinish > minFinish) {
            minFinish = boundFinish;
            finishDriver = { kind: 'predecessor', relationshipId: rel.id, predecessorId: pred.id };
          }
        }
      }

      let actEf = remDur > 0 ? addWorkingMinutes(cal, remStart, remDur) : remStart;
      if (minFinish > actEf && finishDriver !== null) {
        actEf = minFinish;
        driver = finishDriver;
      }

      const c1 = applyInProgressFinishConstraint(act.constraint, cal, actEf, driver);
      const c2 = applyInProgressFinishConstraint(act.secondaryConstraint, cal, c1.ef, c1.driver);
      actEf = c2.ef;
      driver = c2.driver;

      es[u] = actEs;
      ef[u] = Math.max(actEs, actEf);
      drivers[u] = driver;
      continue;
    }

    // Not started activity
    let bestEs = isFinishMs ? projectStart : snapForwardToWorkStart(cal, projectStart);
    let driver: DriverReason = { kind: 'project_start' };

    if (rules.statusDateFloorForUnstarted && statusMin !== null) {
      const statusAnchor = isFinishMs ? statusMin : snapForwardToWorkStart(cal, statusMin);
      if (statusAnchor > bestEs) {
        bestEs = statusAnchor;
        driver = { kind: 'status_date' };
      }
    }

    for (let j = 0; j < inEdges.length; j++) {
      const edgeIdx = inEdges[j]!;
      const rel = graph.activeRelationships[edgeIdx]!;
      const p = graph.edgePredIndex[edgeIdx]!;
      const pred = graph.nodes[p]!;
      const lagCal = resolveLagCalendar(rel, document.settings, nodeCalendars[p]!, cal, defaultCal);

      const anchor = rel.type === 'FS' || rel.type === 'FF' ? ef[p]! : es[p]!;
      const raw = addWorkingMinutes(lagCal, anchor, rel.lagMinutes);
      let boundEs: number;
      if (isFinishMs) {
        boundEs = rules.finishMilestoneOnPredFinish ? raw : snapBackwardToWorkFinish(cal, raw);
      } else if (isStartMs || remDur === 0) {
        boundEs = snapForwardToWorkStart(cal, raw);
      } else if (rel.type === 'FS' || rel.type === 'SS') {
        boundEs = snapForwardToWorkStart(cal, raw);
      } else {
        const boundEf = snapBackwardToWorkFinish(cal, raw);
        boundEs = subtractWorkingMinutes(cal, boundEf, remDur);
      }

      let wasClamped = false;
      if (rel.lagMinutes < 0 && boundEs < projectStart) {
        boundEs = isFinishMs ? projectStart : snapForwardToWorkStart(cal, projectStart);
        wasClamped = true;
        warnings.push({
          code: 'TRUNCATED_LEAD',
          activityId: act.id,
          relationshipId: rel.id,
          message: `Lead on ${pred.code} → ${act.code} was clamped at the project start.`,
        });
      }

      if (boundEs > bestEs || (!wasClamped && boundEs === bestEs && driver.kind === 'project_start')) {
        bestEs = boundEs;
        driver = { kind: 'predecessor', relationshipId: rel.id, predecessorId: pred.id };
      }
    }

    const c1 = applyForwardConstraint(
      act.constraint,
      cal,
      remDur,
      isStartMs,
      isFinishMs,
      bestEs,
      driver,
    );
    const c2 = applyForwardConstraint(
      act.secondaryConstraint,
      cal,
      remDur,
      isStartMs,
      isFinishMs,
      c1.es,
      c1.driver,
    );

    const finalEs = c2.es;
    const finalEf = isMilestone || remDur === 0 ? finalEs : addWorkingMinutes(cal, finalEs, remDur);
    es[u] = finalEs;
    ef[u] = finalEf;
    drivers[u] = c2.driver;
  }

  return {
    projectStart,
    es,
    ef,
    drivers,
    warnings,
    activeLinkMask,
  };
}

export interface BackwardState {
  readonly projectFinish: number;
  readonly ls: Int32Array;
  readonly lf: Int32Array;
  readonly warnings: SolverWarning[];
}

function reverseLinkFinishBound(
  rel: ScheduleRelationship,
  cal: CompiledCalendar,
  lagCal: CompiledCalendar,
  backDur: number,
  isStartMs: boolean,
  succStart: number,
  succFinish: number,
): number {
  switch (rel.type) {
    case 'FS': {
      const raw = subtractWorkingMinutes(lagCal, succStart, rel.lagMinutes);
      return isStartMs ? snapForwardToWorkStart(cal, raw) : snapBackwardToWorkFinish(cal, raw);
    }
    case 'SS': {
      const raw = subtractWorkingMinutes(lagCal, succStart, rel.lagMinutes);
      return backDur > 0 ? addWorkingMinutes(cal, raw, backDur) : raw;
    }
    case 'FF': {
      const raw = subtractWorkingMinutes(lagCal, succFinish, rel.lagMinutes);
      return isStartMs ? snapForwardToWorkStart(cal, raw) : snapBackwardToWorkFinish(cal, raw);
    }
    case 'SF': {
      const raw = subtractWorkingMinutes(lagCal, succFinish, rel.lagMinutes);
      return backDur > 0 ? addWorkingMinutes(cal, raw, backDur) : raw;
    }
  }
}

function applyLateConstraint(
  c: { type: ConstraintType; date: string | null } | null,
  act: ScheduleActivity,
  cal: CompiledCalendar,
  backDur: number,
  isStartMs: boolean,
  isFinishMs: boolean,
  actEs: number,
  actEf: number,
  currentLf: number,
  warnings: SolverWarning[],
): number {
  if (!c || c.date === null) return currentLf;
  const cMin = toMinutes(c.date);
  switch (c.type) {
    case 'finish_on_or_before':
    case 'finish_on': {
      const targetLf = isStartMs
        ? snapForwardToWorkStart(cal, cMin)
        : snapBackwardToWorkFinish(cal, cMin);
      if (targetLf < actEf) {
        warnings.push({
          code: 'CONSTRAINT_VIOLATED',
          activityId: act.id,
          relationshipId: null,
          message: `${act.code} misses its ${c.type} constraint (${c.date}).`,
        });
      }
      return Math.min(currentLf, targetLf);
    }
    case 'start_on_or_before':
    case 'start_on': {
      const targetLs = isFinishMs ? cMin : snapForwardToWorkStart(cal, cMin);
      if (targetLs < actEs) {
        warnings.push({
          code: 'CONSTRAINT_VIOLATED',
          activityId: act.id,
          relationshipId: null,
          message: `${act.code} misses its ${c.type} constraint (${c.date}).`,
        });
      }
      const targetLf = backDur > 0 ? addWorkingMinutes(cal, targetLs, backDur) : targetLs;
      return Math.min(currentLf, targetLf);
    }
    case 'mandatory_finish': {
      return isStartMs ? snapForwardToWorkStart(cal, cMin) : snapBackwardToWorkFinish(cal, cMin);
    }
    case 'mandatory_start': {
      const targetLs = isFinishMs ? cMin : snapForwardToWorkStart(cal, cMin);
      return backDur > 0 ? addWorkingMinutes(cal, targetLs, backDur) : targetLs;
    }
    default:
      return currentLf;
  }
}

/**
 * Backward pass in reverse topological order (spec §5.4 step 2).
 */
export function runBackwardPass(
  document: ScheduleDocument,
  graph: ScheduleGraph,
  calendars: ReadonlyMap<string, CompiledCalendar>,
  rules: ResolvedRules,
  forward: ForwardState,
): BackwardState {
  const n = graph.nodes.length;
  const defaultCal = resolveDefaultCalendar(document.settings, calendars);
  const nodeCalendars = resolveNodeCalendars(graph.nodes, calendars, defaultCal);
  const progressOverride = document.settings.progressMode === 'progress_override';

  let maxEf = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    if (graph.nodes[i]!.type === 'level_of_effort') continue;
    const efVal = forward.ef[i]!;
    if (efVal > maxEf) maxEf = efVal;
  }
  if (!Number.isFinite(maxEf)) {
    for (let i = 0; i < n; i++) {
      const efVal = forward.ef[i]!;
      if (efVal > maxEf) maxEf = efVal;
    }
  }
  const projectFinish = Number.isFinite(maxEf) ? maxEf : forward.projectStart;

  const warnings: SolverWarning[] = [];
  const mustFinishByMin =
    document.settings.mustFinishBy !== null ? toMinutes(document.settings.mustFinishBy) : null;
  if (mustFinishByMin !== null && n > 0 && projectFinish > mustFinishByMin) {
    warnings.push({
      code: 'MISSED_MUST_FINISH_BY',
      activityId: null,
      relationshipId: null,
      message: `Projected finish (${toWallClock(projectFinish)}) is after must finish by (${document.settings.mustFinishBy}).`,
    });
  }
  const lateAnchor = mustFinishByMin !== null ? mustFinishByMin : projectFinish;

  const ls = new Int32Array(n);
  const lf = new Int32Array(n);

  for (let ordIdx = graph.activityOrder.length - 1; ordIdx >= 0; ordIdx--) {
    const u = graph.activityOrder[ordIdx]!;
    const act = graph.nodes[u]!;
    const cal = nodeCalendars[u]!;
    const isStartMs = act.type === 'start_milestone';
    const isFinishMs = act.type === 'finish_milestone';
    const isMilestone = isStartMs || isFinishMs;

    if (act.status === 'completed' && rules.completedLateDates === 'keep_actuals') {
      ls[u] = forward.es[u]!;
      lf[u] = forward.ef[u]!;
      continue;
    }

    const backDur = isMilestone
      ? 0
      : act.status === 'completed'
        ? Math.max(0, act.originalDuration)
        : Math.max(0, act.remainingDuration);

    let bestLf =
      isFinishMs && rules.finishMilestoneOnPredFinish
        ? lateAnchor
        : snapBackwardToWorkFinish(cal, lateAnchor);

    const outEdges = graph.outgoingEdgeIndices[u]!;
    for (let j = 0; j < outEdges.length; j++) {
      const edgeIdx = outEdges[j]!;
      const rel = graph.activeRelationships[edgeIdx]!;
      const s = graph.edgeSuccIndex[edgeIdx]!;
      const succ = graph.nodes[s]!;
      if (succ.type === 'level_of_effort') continue;
      if (
        progressOverride &&
        forward.activeLinkMask[edgeIdx] === 0 &&
        rules.progressOverrideLateSide === 'ignore_link_to_started'
      ) {
        continue;
      }

      const lagCal = resolveLagCalendar(rel, document.settings, cal, nodeCalendars[s]!, defaultCal);
      const boundLf = reverseLinkFinishBound(rel, cal, lagCal, backDur, isStartMs, ls[s]!, lf[s]!);
      if (boundLf < bestLf) {
        bestLf = boundLf;
      }
    }

    bestLf = applyLateConstraint(
      act.constraint,
      act,
      cal,
      backDur,
      isStartMs,
      isFinishMs,
      forward.es[u]!,
      forward.ef[u]!,
      bestLf,
      warnings,
    );
    bestLf = applyLateConstraint(
      act.secondaryConstraint,
      act,
      cal,
      backDur,
      isStartMs,
      isFinishMs,
      forward.es[u]!,
      forward.ef[u]!,
      bestLf,
      warnings,
    );

    lf[u] = bestLf;
    ls[u] = backDur > 0 ? subtractWorkingMinutes(cal, bestLf, backDur) : bestLf;
  }

  return {
    projectFinish,
    ls,
    lf,
    warnings,
  };
}

function hasAlapConstraint(act: ScheduleActivity): boolean {
  return (
    act.constraint?.type === 'as_late_as_possible' ||
    act.secondaryConstraint?.type === 'as_late_as_possible'
  );
}

/**
 * Post-passes for ALAP and LOE activities (spec §5.4 step 3).
 * Mutates `forward.es`, `forward.ef`, `backward.ls`, `backward.lf` and `backward.warnings` in place.
 */
export function runPostPasses(
  document: ScheduleDocument,
  graph: ScheduleGraph,
  calendars: ReadonlyMap<string, CompiledCalendar>,
  rules: ResolvedRules,
  forward: ForwardState,
  backward: BackwardState,
): void {
  const defaultCal = resolveDefaultCalendar(document.settings, calendars);
  const nodeCalendars = resolveNodeCalendars(graph.nodes, calendars, defaultCal);

  // 1. ALAP pass (reverse topological order so chained ALAP tasks delay cleanly).
  for (let ordIdx = graph.activityOrder.length - 1; ordIdx >= 0; ordIdx--) {
    const u = graph.activityOrder[ordIdx]!;
    const act = graph.nodes[u]!;
    if (act.status !== 'not_started' || act.type === 'level_of_effort' || !hasAlapConstraint(act)) {
      continue;
    }
    const cal = nodeCalendars[u]!;
    const isStartMs = act.type === 'start_milestone';
    const isMilestone = isStartMs || act.type === 'finish_milestone';
    const remDur = isMilestone ? 0 : Math.max(0, act.remainingDuration);

    if (rules.alapBehavior === 'to_late_dates') {
      forward.es[u] = backward.ls[u]!;
      forward.ef[u] = backward.lf[u]!;
      continue;
    }

    // Delay only within free float so no successor's early dates are disturbed.
    let limitLf = backward.lf[u]!;
    const outEdges = graph.outgoingEdgeIndices[u]!;
    for (let j = 0; j < outEdges.length; j++) {
      const edgeIdx = outEdges[j]!;
      if (forward.activeLinkMask[edgeIdx] === 0) continue;
      const rel = graph.activeRelationships[edgeIdx]!;
      const s = graph.edgeSuccIndex[edgeIdx]!;
      if (graph.nodes[s]!.type === 'level_of_effort') continue;
      const lagCal = resolveLagCalendar(rel, document.settings, cal, nodeCalendars[s]!, defaultCal);
      const boundLf = reverseLinkFinishBound(
        rel,
        cal,
        lagCal,
        remDur,
        isStartMs,
        forward.es[s]!,
        forward.ef[s]!,
      );
      if (boundLf < limitLf) {
        limitLf = boundLf;
      }
    }

    if (limitLf > forward.ef[u]!) {
      forward.ef[u] = limitLf;
      forward.es[u] = remDur > 0 ? subtractWorkingMinutes(cal, limitLf, remDur) : limitLf;
    }
  }

  // 2. LOE pass (topological order so chained LOEs work).
  for (let ordIdx = 0; ordIdx < graph.activityOrder.length; ordIdx++) {
    const u = graph.activityOrder[ordIdx]!;
    const act = graph.nodes[u]!;
    if (act.type !== 'level_of_effort') continue;
    if (act.status === 'completed') {
      backward.ls[u] = forward.es[u]!;
      backward.lf[u] = forward.ef[u]!;
      continue;
    }

    const cal = nodeCalendars[u]!;
    let earliestStart = Number.POSITIVE_INFINITY;
    let latestFinish = Number.NEGATIVE_INFINITY;
    let hasStart = false;
    let hasFinish = false;

    if (act.status === 'in_progress' && act.actualStart !== null) {
      earliestStart = toMinutes(act.actualStart);
      hasStart = true;
    }

    const inEdges = graph.incomingEdgeIndices[u]!;
    for (let j = 0; j < inEdges.length; j++) {
      const edgeIdx = inEdges[j]!;
      const rel = graph.activeRelationships[edgeIdx]!;
      const p = graph.edgePredIndex[edgeIdx]!;
      const lagCal = resolveLagCalendar(rel, document.settings, nodeCalendars[p]!, cal, defaultCal);
      if (rel.type === 'SS' || rel.type === 'FS') {
        const anchor = rel.type === 'SS' ? forward.es[p]! : forward.ef[p]!;
        const candidate = snapForwardToWorkStart(cal, addWorkingMinutes(lagCal, anchor, rel.lagMinutes));
        if (!hasStart || candidate < earliestStart) {
          earliestStart = candidate;
          hasStart = true;
        }
      } else {
        const anchor = rel.type === 'FF' ? forward.ef[p]! : forward.es[p]!;
        const candidate = snapBackwardToWorkFinish(
          cal,
          addWorkingMinutes(lagCal, anchor, rel.lagMinutes),
        );
        if (!hasFinish || candidate > latestFinish) {
          latestFinish = candidate;
          hasFinish = true;
        }
      }
    }

    const outEdges = graph.outgoingEdgeIndices[u]!;
    for (let j = 0; j < outEdges.length; j++) {
      const edgeIdx = outEdges[j]!;
      const rel = graph.activeRelationships[edgeIdx]!;
      const s = graph.edgeSuccIndex[edgeIdx]!;
      const lagCal = resolveLagCalendar(rel, document.settings, cal, nodeCalendars[s]!, defaultCal);
      if (rel.type === 'FF' || rel.type === 'FS' || rel.type === 'SF') {
        const anchor = rel.type === 'FF' ? forward.ef[s]! : forward.es[s]!;
        const candidate = snapBackwardToWorkFinish(
          cal,
          subtractWorkingMinutes(lagCal, anchor, rel.lagMinutes),
        );
        if (!hasFinish || candidate > latestFinish) {
          latestFinish = candidate;
          hasFinish = true;
        }
      } else {
        const candidate = snapForwardToWorkStart(
          cal,
          subtractWorkingMinutes(lagCal, forward.es[s]!, rel.lagMinutes),
        );
        if (!hasStart || candidate < earliestStart) {
          earliestStart = candidate;
          hasStart = true;
        }
      }
    }

    if (!hasStart || !hasFinish) {
      backward.warnings.push({
        code: 'LOE_UNBOUNDED',
        activityId: act.id,
        relationshipId: null,
        message: `${act.code} is a level of effort activity without both start and finish links.`,
      });
    }

    const finalEs = hasStart ? earliestStart : forward.es[u]!;
    const finalEf = Math.max(finalEs, hasFinish ? latestFinish : forward.ef[u]!);
    forward.es[u] = finalEs;
    forward.ef[u] = finalEf;
    backward.ls[u] = finalEs;
    backward.lf[u] = finalEf;
  }
}

function formatFloatDays(minutes: number, hoursPerDay: number): string {
  const dayMinutes = Math.max(1, hoursPerDay * 60);
  const rounded = Math.round((minutes / dayMinutes) * 10) / 10;
  const safe = rounded === 0 ? 0 : rounded;
  return `${safe} d`;
}

/**
 * Computes activity total/free float, relationship free float & driving status, longest path,
 * criticality, near-criticality and `NEGATIVE_FLOAT` warnings (spec §5.4 step 4).
 */
export function computeFloatsAndCriticality(
  document: ScheduleDocument,
  graph: ScheduleGraph,
  calendars: ReadonlyMap<string, CompiledCalendar>,
  rules: ResolvedRules,
  forward: ForwardState,
  backward: BackwardState,
): {
  activities: Record<string, ComputedActivityResult>;
  relationships: Record<string, ComputedRelationshipResult>;
  warnings: SolverWarning[];
} {
  const n = graph.nodes.length;
  const edgeCount = graph.activeRelationships.length;
  const defaultCal = resolveDefaultCalendar(document.settings, calendars);
  const nodeCalendars = resolveNodeCalendars(graph.nodes, calendars, defaultCal);

  const edgeFreeFloat = new Int32Array(edgeCount);
  const edgeIsDriving = new Uint8Array(edgeCount);
  const relationships: Record<string, ComputedRelationshipResult> = {};

  for (let edgeIdx = 0; edgeIdx < edgeCount; edgeIdx++) {
    const rel = graph.activeRelationships[edgeIdx]!;
    const u = graph.edgePredIndex[edgeIdx]!;
    const s = graph.edgeSuccIndex[edgeIdx]!;
    const pred = graph.nodes[u]!;
    const succ = graph.nodes[s]!;
    const lagCal = resolveLagCalendar(
      rel,
      document.settings,
      nodeCalendars[u]!,
      nodeCalendars[s]!,
      defaultCal,
    );

    const predAnchor =
      rel.type === 'FS' || rel.type === 'FF' ? forward.ef[u]! : forward.es[u]!;
    const linkBound = addWorkingMinutes(lagCal, predAnchor, rel.lagMinutes);
    const succAnchor =
      rel.type === 'FS' || rel.type === 'SS' ? forward.es[s]! : forward.ef[s]!;
    const relFreeFloat = workingMinutesBetween(lagCal, linkBound, succAnchor);
    const active =
      forward.activeLinkMask[edgeIdx] === 1 &&
      pred.type !== 'level_of_effort' &&
      succ.type !== 'level_of_effort';
    const isDriving = active && relFreeFloat <= 0;

    edgeFreeFloat[edgeIdx] = relFreeFloat;
    edgeIsDriving[edgeIdx] = isDriving ? 1 : 0;
    relationships[rel.id] = { freeFloat: relFreeFloat, isDriving };
  }

  // Longest path: iterative backward walk along driving links from terminal non-LOE nodes.
  const isLongestPath = new Uint8Array(n);
  const stack = new Int32Array(n);
  let stackTop = 0;
  for (let u = 0; u < n; u++) {
    if (graph.nodes[u]!.type === 'level_of_effort') continue;
    if (forward.ef[u]! === backward.projectFinish) {
      isLongestPath[u] = 1;
      stack[stackTop++] = u;
    }
  }
  while (stackTop > 0) {
    const v = stack[--stackTop]!;
    const inEdges = graph.incomingEdgeIndices[v]!;
    for (let j = 0; j < inEdges.length; j++) {
      const edgeIdx = inEdges[j]!;
      if (edgeIsDriving[edgeIdx] !== 1) continue;
      const p = graph.edgePredIndex[edgeIdx]!;
      if (isLongestPath[p] === 0 && graph.nodes[p]!.type !== 'level_of_effort') {
        isLongestPath[p] = 1;
        stack[stackTop++] = p;
      }
    }
  }

  const activities: Record<string, ComputedActivityResult> = {};
  const warnings: SolverWarning[] = [];
  const { criticalDefinition, criticalThresholdMinutes, nearCriticalThresholdMinutes } =
    document.settings;

  for (let u = 0; u < n; u++) {
    const act = graph.nodes[u]!;
    const cal = nodeCalendars[u]!;
    const actEs = forward.es[u]!;
    const actEf = forward.ef[u]!;
    const actLs = backward.ls[u]!;
    const actLf = backward.lf[u]!;

    const finishFloat = workingMinutesBetween(cal, actEf, actLf);
    const totalFloat =
      rules.totalFloatFormula === 'finish_float'
        ? finishFloat
        : Math.min(workingMinutesBetween(cal, actEs, actLs), finishFloat);

    let freeFloat: number;
    if (act.type === 'level_of_effort') {
      freeFloat = 0;
    } else {
      const outEdges = graph.outgoingEdgeIndices[u]!;
      let minFf = Number.POSITIVE_INFINITY;
      for (let j = 0; j < outEdges.length; j++) {
        const edgeIdx = outEdges[j]!;
        if (forward.activeLinkMask[edgeIdx] !== 1) continue;
        const s = graph.edgeSuccIndex[edgeIdx]!;
        if (graph.nodes[s]!.type === 'level_of_effort') continue;
        const ff = edgeFreeFloat[edgeIdx]!;
        if (ff < minFf) minFf = ff;
      }
      freeFloat = Number.isFinite(minFf) ? minFf : 0;
      if (rules.freeFloatFloorZero && freeFloat < 0) {
        freeFloat = 0;
      }
    }

    if (totalFloat < 0) {
      warnings.push({
        code: 'NEGATIVE_FLOAT',
        activityId: act.id,
        relationshipId: null,
        message: `${act.code} has negative total float (${formatFloatDays(totalFloat, cal.hoursPerDay)}).`,
      });
    }

    const longest = isLongestPath[u] === 1;
    const isCritical =
      criticalDefinition === 'longest_path'
        ? longest
        : totalFloat <= criticalThresholdMinutes;
    const isNearCritical = !isCritical && totalFloat <= nearCriticalThresholdMinutes;

    activities[act.id] = {
      earlyStart: toWallClock(actEs),
      earlyFinish: toWallClock(actEf),
      lateStart: toWallClock(actLs),
      lateFinish: toWallClock(actLf),
      totalFloat,
      freeFloat,
      isCritical,
      isNearCritical,
      isLongestPath: longest,
      driver: forward.drivers[u]!,
    };
  }

  return { activities, relationships, warnings };
}

