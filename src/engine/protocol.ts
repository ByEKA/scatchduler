import type {
  ComputedScheduleSummary,
  ComputedWbsRollup,
  DrivingPath,
  ScheduleDocument,
  SolveResult,
} from '@/data/schedule-types';
import type { ISODate, ISODateTime } from '@/data/types';

export interface MaterializeOptions {
  scheduleStatusDate: ISODate | null;
}

/**
 * Typed request/response protocol for `src/engine/worker.ts` (spec §5.6).
 * Worker transport and request execution are wired in Task 18.
 */
export type EngineRequest =
  | { id: number; op: 'solve'; document: ScheduleDocument; calculatedAt: ISODateTime }
  | {
      id: number;
      op: 'rollup';
      document: ScheduleDocument;
      summary: ComputedScheduleSummary | null;
    }
  | { id: number; op: 'traceDrivingPath'; activityId: string };

export type EngineResponse =
  | { id: number; op: 'solve'; result: SolveResult }
  | { id: number; op: 'rollup'; rollups: Record<string, ComputedWbsRollup> }
  | { id: number; op: 'traceDrivingPath'; path: DrivingPath }
  | { id: number; op: 'error'; message: string };
