import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import { RepositoryError } from '@/data/errors';
import type { ID, Schedule, ScheduleLock } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export const LOCK_HEARTBEAT_MS = 120_000;

/**
 * Manages the active 15-minute edit lock for a schedule (R1–R4, V8):
 * - Renews every 2 minutes while held by the current user; flags `lost` on conflict
 * - Releases best effort on unmount and `pagehide` while held
 */
export function useScheduleLock(schedule: Schedule | undefined): {
  lock: ScheduleLock | null;
  isMine: boolean;
  lost: boolean;
  acquire(): Promise<void>;
  release(): Promise<void>;
  forceRelease(): Promise<void>;
} {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const [lostForId, setLostForId] = useState<ID | null>(null);

  const scheduleId = schedule?.id;
  const projectId = schedule?.projectId;
  const lock = schedule?.lock ?? null;
  const lost = scheduleId !== undefined && lostForId === scheduleId;
  const isMine = lock !== null && me !== undefined && lock.userId === me.id && !lost;

  const heldScheduleIdRef = useRef<ID | null>(null);
  const repositoryRef = useRef(repository);

  useEffect(() => {
    repositoryRef.current = repository;
  }, [repository]);

  useEffect(() => {
    heldScheduleIdRef.current = isMine && scheduleId !== undefined ? scheduleId : null;
  }, [isMine, scheduleId]);

  // Renew lock every 2 minutes while held and release best-effort on pagehide.
  useEffect(() => {
    if (!isMine || scheduleId === undefined || projectId === undefined) return;

    const timer = setInterval(() => {
      void repository.renewScheduleLock(scheduleId).catch((error: unknown) => {
        if (error instanceof RepositoryError && error.code === 'conflict') {
          heldScheduleIdRef.current = null;
          setLostForId(scheduleId);
          void queryClient.invalidateQueries({ queryKey: queryKeys.schedules(projectId) });
        }
      });
    }, LOCK_HEARTBEAT_MS);

    const onPageHide = () => {
      const heldId = heldScheduleIdRef.current;
      if (heldId !== null) {
        heldScheduleIdRef.current = null;
        void repositoryRef.current.releaseScheduleLock(heldId).catch(() => undefined);
      }
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [isMine, projectId, queryClient, repository, scheduleId]);

  // Release best-effort on unmount or schedule switch if the lock is still held by this tab.
  useEffect(() => {
    return () => {
      const heldId = heldScheduleIdRef.current;
      if (heldId !== null) {
        heldScheduleIdRef.current = null;
        void repositoryRef.current.releaseScheduleLock(heldId).catch(() => undefined);
      }
    };
  }, [scheduleId]);

  const invalidate = useCallback(
    async (pid: ID) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.schedules(pid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() }),
      ]);
    },
    [queryClient],
  );

  const acquire = useCallback(async () => {
    if (scheduleId === undefined || projectId === undefined) return;
    await repository.acquireScheduleLock(scheduleId);
    setLostForId(null);
    heldScheduleIdRef.current = scheduleId;
    await invalidate(projectId);
  }, [invalidate, projectId, repository, scheduleId]);

  const release = useCallback(async () => {
    if (scheduleId === undefined || projectId === undefined) return;
    heldScheduleIdRef.current = null;
    await repository.releaseScheduleLock(scheduleId);
    setLostForId(null);
    await invalidate(projectId);
  }, [invalidate, projectId, repository, scheduleId]);

  const forceRelease = useCallback(async () => {
    if (scheduleId === undefined || projectId === undefined) return;
    await repository.forceReleaseScheduleLock(scheduleId);
    await invalidate(projectId);
  }, [invalidate, projectId, repository, scheduleId]);

  return {
    lock,
    isMine,
    lost,
    acquire,
    release,
    forceRelease,
  };
}
