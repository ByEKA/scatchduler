import type { ComputedScheduleSummary, ScheduleDocument, SolveResult } from '@/data/schedule-types';
import type { ISODateTime } from '@/data/types';
import { compileCalendar, type CompiledCalendar } from '@/engine/calendar';
import {
  computeFloatsAndCriticality,
  runBackwardPass,
  runForwardPass,
  runPostPasses,
} from '@/engine/cpm';
import { traceDrivingPath } from '@/engine/driving';
import { buildGraph } from '@/engine/graph';
import { createBlankDocument, fromImportModel, type ImportModel } from '@/engine/materialize';
import { resolveRules, type ResolvedRules } from '@/engine/profiles';
import { rollup } from '@/engine/rollup';
import { toWallClock } from '@/engine/time';

export { createBlankDocument, fromImportModel, resolveRules, rollup, traceDrivingPath };
export type { ImportModel, ResolvedRules };

/**
 * Pure CPM schedule solver facade (spec §5.1–§5.5).
 * Compiles calendars, checks acyclicity, runs forward/backward/ALAP/LOE passes, computes floats,
 * criticality, driving links and bottom-up WBS rollups.
 */
export function solve(
  document: ScheduleDocument,
  options: { calculatedAt: ISODateTime },
): SolveResult {
  const startedAt = performance.now();

  const compiledCalendars = new Map<string, CompiledCalendar>();
  for (let i = 0; i < document.calendars.length; i++) {
    const cal = document.calendars[i]!;
    const compiled = compileCalendar(cal);
    if ('code' in compiled) {
      return { ok: false, error: compiled };
    }
    compiledCalendars.set(cal.id, compiled);
  }

  const graphRes = buildGraph(document);
  if (!graphRes.ok) {
    return { ok: false, error: graphRes.error };
  }

  const { graph } = graphRes;
  const rules = resolveRules(document.settings.profile, document.settings.ruleOverrides);
  const forward = runForwardPass(document, graph, compiledCalendars, rules);
  const backward = runBackwardPass(document, graph, compiledCalendars, rules, forward);
  runPostPasses(document, graph, compiledCalendars, rules, forward, backward);
  const floats = computeFloatsAndCriticality(
    document,
    graph,
    compiledCalendars,
    rules,
    forward,
    backward,
  );

  const hasNodes = graph.nodes.length > 0;
  const partialSummary: ComputedScheduleSummary = {
    calculatedAt: options.calculatedAt,
    durationMs: 0,
    projectStart: hasNodes ? toWallClock(forward.projectStart) : null,
    projectFinish: hasNodes ? toWallClock(backward.projectFinish) : null,
    activities: floats.activities,
    relationships: floats.relationships,
    wbsRollups: {},
    warnings: [...graph.warnings, ...forward.warnings, ...backward.warnings, ...floats.warnings],
  };

  const calculatedDoc: ScheduleDocument =
    document.settings.displayMode === 'calculated'
      ? document
      : { ...document, settings: { ...document.settings, displayMode: 'calculated' } };

  const wbsRollups = rollup(calculatedDoc, partialSummary);
  const durationMs = performance.now() - startedAt;

  return {
    ok: true,
    summary: {
      ...partialSummary,
      durationMs,
      wbsRollups,
    },
  };
}
