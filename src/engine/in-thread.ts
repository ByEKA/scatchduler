import type { ComputedScheduleSummary, ScheduleDocument } from '@/data/schedule-types';
import { rollup, solve, traceDrivingPath } from './index';
import { NO_CALCULATED_SCHEDULE, type EngineSession } from './protocol';

/**
 * Stateful CPM engine session shared by `src/engine/worker.ts` and the in-thread fallback
 * (spec §5.6). Caches the most recent solved document and summary so `traceDrivingPath`
 * answers without re-transferring large schedules.
 */
export function createEngineSession(): EngineSession {
  let lastDocument: ScheduleDocument | null = null;
  let lastSummary: ComputedScheduleSummary | null = null;

  return {
    async solve(document, calculatedAt) {
      const result = solve(document, { calculatedAt });
      if (result.ok) {
        lastDocument = document;
        lastSummary = result.summary;
      }
      return result;
    },
    async rollup(document, summary) {
      return rollup(document, summary);
    },
    async traceDrivingPath(activityId) {
      if (lastDocument === null || lastSummary === null) {
        throw new Error(NO_CALCULATED_SCHEDULE);
      }
      return traceDrivingPath(lastDocument, lastSummary, activityId);
    },
  };
}
