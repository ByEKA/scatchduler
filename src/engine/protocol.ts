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

export const NO_CALCULATED_SCHEDULE = 'No calculated schedule available.';

/**
 * Typed request/response protocol for `src/engine/worker.ts` (spec §5.6).
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
  | { id: number; ok: true; op: 'solve'; result: SolveResult }
  | { id: number; ok: true; op: 'rollup'; rollups: Record<string, ComputedWbsRollup> }
  | { id: number; ok: true; op: 'traceDrivingPath'; path: DrivingPath }
  | { id: number; ok: false; message: string };

export interface EngineSession {
  solve(document: ScheduleDocument, calculatedAt: ISODateTime): Promise<SolveResult>;
  rollup(
    document: ScheduleDocument,
    summary: ComputedScheduleSummary | null,
  ): Promise<Record<string, ComputedWbsRollup>>;
  traceDrivingPath(activityId: string): Promise<DrivingPath>;
}
