import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ComputedScheduleSummary,
  ComputedWbsRollup,
  DrivingPath,
  ScheduleDocument,
  SolveResult,
} from '@/data/schedule-types';
import { createEngineClient, type EngineClient } from '@/engine/client';

/**
 * Owns a single lazily created CPM `EngineClient` (Web Worker or jsdom in-thread fallback),
 * supplies `calculatedAt` timestamps from the hook layer, tracks `isCalculating`, and disposes
 * the worker on unmount (spec §5.6).
 */
export function useScheduleEngine(): {
  solve(document: ScheduleDocument): Promise<SolveResult>;
  rollup(
    document: ScheduleDocument,
    summary: ComputedScheduleSummary | null,
  ): Promise<Record<string, ComputedWbsRollup>>;
  traceDrivingPath(activityId: string): Promise<DrivingPath>;
  isCalculating: boolean;
} {
  const clientRef = useRef<EngineClient | null>(null);
  const inFlightRef = useRef(0);
  const [isCalculating, setIsCalculating] = useState(false);

  const getClient = useCallback((): EngineClient => {
    if (clientRef.current === null) {
      clientRef.current = createEngineClient();
    }
    return clientRef.current;
  }, []);

  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  const solve = useCallback(
    async (document: ScheduleDocument): Promise<SolveResult> => {
      inFlightRef.current += 1;
      setIsCalculating(true);
      try {
        return await getClient().solve(document, { calculatedAt: new Date().toISOString() });
      } finally {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        if (inFlightRef.current === 0) {
          setIsCalculating(false);
        }
      }
    },
    [getClient],
  );

  const rollup = useCallback(
    async (
      document: ScheduleDocument,
      summary: ComputedScheduleSummary | null,
    ): Promise<Record<string, ComputedWbsRollup>> => {
      return getClient().rollup(document, summary);
    },
    [getClient],
  );

  const traceDrivingPath = useCallback(
    async (activityId: string): Promise<DrivingPath> => {
      return getClient().traceDrivingPath(activityId);
    },
    [getClient],
  );

  return {
    solve,
    rollup,
    traceDrivingPath,
    isCalculating,
  };
}
