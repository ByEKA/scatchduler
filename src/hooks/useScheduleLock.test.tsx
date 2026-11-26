import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { LOCK_HEARTBEAT_MS, useScheduleLock } from '@/hooks/useScheduleLock';
import { createTestDataLayer } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

afterEach(() => {
  vi.useRealTimers();
});

describe('useScheduleLock', () => {
  it('renews every 120 s while held, flags lost on conflict, and releases on unmount', async () => {
    const dl = createTestDataLayer();
    const harbor = dl.store.read().projects.find((p) => p.code === '003')!;
    const up02 = (await dl.repository.listSchedules(harbor.id)).find((s) => s.code === 'UP-02')!;
    const lock = await dl.repository.acquireScheduleLock(up02.id);
    const lockedSchedule = { ...up02, lock };

    const renewSpy = vi.spyOn(dl.repository, 'renewScheduleLock');
    const releaseSpy = vi.spyOn(dl.repository, 'releaseScheduleLock');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    const wrapper = createQueryWrapper(dl);
    const { result, unmount } = renderHook(() => useScheduleLock(lockedSchedule), { wrapper });
    await waitFor(() => expect(result.current.isMine).toBe(true));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
    });
    expect(renewSpy).toHaveBeenCalledTimes(1);
    expect(result.current.lost).toBe(false);

    // Simulate another user taking an expired lock -> conflict sets lost: true
    renewSpy.mockRejectedValueOnce(
      new RepositoryError(
        'conflict',
        'Your edit lock expired. Download your changes or reload the schedule.',
      ),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOCK_HEARTBEAT_MS);
    });
    expect(result.current.lost).toBe(true);
    expect(result.current.isMine).toBe(false);

    unmount();
    expect(releaseSpy).not.toHaveBeenCalled();
  });

  it('releases best-effort on unmount while still mine and supports owner forceRelease', async () => {
    const dl = createTestDataLayer();
    const harbor = dl.store.read().projects.find((p) => p.code === '003')!;
    const up02 = (await dl.repository.listSchedules(harbor.id)).find((s) => s.code === 'UP-02')!;
    const lock = await dl.repository.acquireScheduleLock(up02.id);
    const lockedSchedule = { ...up02, lock };

    const releaseSpy = vi.spyOn(dl.repository, 'releaseScheduleLock');
    const forceSpy = vi.spyOn(dl.repository, 'forceReleaseScheduleLock');
    const wrapper = createQueryWrapper(dl);

    const { result, unmount } = renderHook(() => useScheduleLock(lockedSchedule), { wrapper });
    await waitFor(() => expect(result.current.isMine).toBe(true));

    await act(async () => {
      await result.current.forceRelease();
    });
    expect(forceSpy).toHaveBeenCalledWith(up02.id);

    unmount();
    expect(releaseSpy).toHaveBeenCalledWith(up02.id);
  });
});
