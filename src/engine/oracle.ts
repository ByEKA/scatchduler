import type { ComputedScheduleSummary, ScheduleDocument } from '@/data/schedule-types';
import { toMinutes } from '@/engine/time';

export type OracleField = 'es' | 'ef' | 'ls' | 'lf' | 'tf' | 'ff';

export interface OracleFieldStats {
  compared: number;
  mismatches: number;
  maxAbsDiffMinutes: number;
}

export interface OracleReport {
  activities: number;
  fields: Record<OracleField, OracleFieldStats>;
  totalMismatches: number;
}

function emptyStats(): OracleFieldStats {
  return { compared: 0, mismatches: 0, maxAbsDiffMinutes: 0 };
}

/**
 * Pure comparator between a `ScheduleDocument`'s verbatim imported `sourceDates` and a
 * `ComputedScheduleSummary` produced by `solve()` (spec §8 V4, S5, D10).
 */
export function compareAgainstOracle(
  document: ScheduleDocument,
  summary: ComputedScheduleSummary,
  toleranceMinutes = 0,
): OracleReport {
  const tolerance = Math.max(0, toleranceMinutes);
  const fields: Record<OracleField, OracleFieldStats> = {
    es: emptyStats(),
    ef: emptyStats(),
    ls: emptyStats(),
    lf: emptyStats(),
    tf: emptyStats(),
    ff: emptyStats(),
  };

  let activities = 0;
  let totalMismatches = 0;

  const checkDate = (key: 'es' | 'ef' | 'ls' | 'lf', expected: string | null, actual: string) => {
    if (expected === null) return;
    const stats = fields[key];
    stats.compared += 1;
    const diff = Math.abs(toMinutes(expected) - toMinutes(actual));
    if (diff > stats.maxAbsDiffMinutes) stats.maxAbsDiffMinutes = diff;
    if (diff > tolerance) {
      stats.mismatches += 1;
      totalMismatches += 1;
    }
  };

  const checkFloat = (key: 'tf' | 'ff', expected: number | null, actual: number) => {
    if (expected === null) return;
    const stats = fields[key];
    stats.compared += 1;
    const diff = Math.abs(expected - actual);
    if (diff > stats.maxAbsDiffMinutes) stats.maxAbsDiffMinutes = diff;
    if (diff > tolerance) {
      stats.mismatches += 1;
      totalMismatches += 1;
    }
  };

  for (let i = 0; i < document.activities.length; i++) {
    const act = document.activities[i]!;
    if (act.type === 'wbs_summary' || act.sourceDates === null) continue;
    const comp = summary.activities[act.id];
    if (!comp) continue;

    activities += 1;
    checkDate('es', act.sourceDates.early.start, comp.earlyStart);
    checkDate('ef', act.sourceDates.early.finish, comp.earlyFinish);
    checkDate('ls', act.sourceDates.late.start, comp.lateStart);
    checkDate('lf', act.sourceDates.late.finish, comp.lateFinish);
    checkFloat('tf', act.sourceDates.totalFloat, comp.totalFloat);
    checkFloat('ff', act.sourceDates.freeFloat, comp.freeFloat);
  }

  return { activities, fields, totalMismatches };
}
