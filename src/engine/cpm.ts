import type {
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
  type CompiledCalendar,
} from '@/engine/calendar';
import type { ScheduleGraph } from '@/engine/graph';
import type { ResolvedRules } from '@/engine/profiles';
import { toMinutes } from '@/engine/time';

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
