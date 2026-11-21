import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as engineClient from '@/engine/client';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { useScheduleEngine } from '@/hooks/useScheduleEngine';

describe('useScheduleEngine', () => {
  it('tracks isCalculating, supplies calculatedAt, traces driving path and disposes client on unmount', async () => {
    const realClient = engineClient.createEngineClient({ createWorker: () => null });
    const disposeSpy = vi.spyOn(realClient, 'dispose');
    const solveSpy = vi.spyOn(realClient, 'solve');
    vi.spyOn(engineClient, 'createEngineClient').mockReturnValue(realClient);

    const doc = makeDocument({
      activities: [makeActivity({ id: 'a', code: 'A10' }), makeActivity({ id: 'b', code: 'A20' })],
      relationships: [makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b' })],
    });

    const { result, unmount } = renderHook(() => useScheduleEngine());
    expect(result.current.isCalculating).toBe(false);

    let solved: Awaited<ReturnType<typeof result.current.solve>> | undefined;
    await act(async () => {
      solved = await result.current.solve(doc);
    });
    expect(solved?.ok).toBe(true);
    expect(result.current.isCalculating).toBe(false);
    expect(solveSpy).toHaveBeenCalledWith(doc, {
      calculatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });

    const path = await result.current.traceDrivingPath('b');
    expect(path.activityIds).toEqual(['b', 'a']);

    unmount();
    expect(disposeSpy).toHaveBeenCalledOnce();
  });
});
