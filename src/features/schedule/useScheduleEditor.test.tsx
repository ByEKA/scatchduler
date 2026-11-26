import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataLayerProvider } from '@/data/DataLayerProvider';
import { RepositoryError } from '@/data/errors';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';
import { useScheduleEditor } from '@/features/schedule/useScheduleEditor';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';

function makeWrapper(dataLayer: TestDataLayer) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <DataLayerProvider value={dataLayer}>{children}</DataLayerProvider>
      </QueryClientProvider>
    );
  };
}

describe('useScheduleEditor', () => {
  it('handles dispatch, dirty/stale flags, undo/redo, and calculate without pushing undo', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    const schedule = (await dataLayer.repository.listSchedules(harbor.id)).find(
      (s) => s.code === 'UP-02',
    )!;
    const initialDocument = makeDocument({
      wbs: [{ id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 }],
      activities: [
        makeActivity({
          id: 'a1',
          code: 'A1010',
          wbsId: 'w1',
          originalDuration: 2400,
          remainingDuration: 2400,
        }),
        makeActivity({
          id: 'a2',
          code: 'A1020',
          wbsId: 'w1',
          originalDuration: 2400,
          remainingDuration: 2400,
        }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' }),
      ],
    });

    const { result } = renderHook(
      () =>
        useScheduleEditor({
          schedule,
          initialDocument,
          initialRevision: schedule.dataRevision,
        }),
      { wrapper: makeWrapper(dataLayer) },
    );

    await waitFor(() => expect(result.current.rollups.w1?.activityCount).toBe(2));
    expect(result.current.dirty).toBe(false);
    expect(result.current.stale).toBe(false);

    // Enter edit mode & dispatch a duration change
    await act(async () => {
      const ok = await result.current.enterEdit();
      expect(ok).toBe(true);
    });
    expect(result.current.mode).toBe('edit');

    act(() => {
      const res = result.current.dispatch({
        type: 'updateActivity',
        activityId: 'a1',
        changes: { originalDuration: 4800, remainingDuration: 4800 },
      });
      expect(res.ok).toBe(true);
    });
    expect(result.current.dirty).toBe(true);
    expect(result.current.stale).toBe(true);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    // Calculate clears stale and switches displayMode without pushing undo entry
    await act(async () => {
      const res = await result.current.calculate();
      expect(res.ok).toBe(true);
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.summary).not.toBeNull();
    expect(result.current.document.settings.displayMode).toBe('calculated');
    expect(result.current.lastAnnouncement).toMatch(/^Calculated in \d+ ms$/);

    // Undo reverts the single edit (calculate was not pushed onto undo stack)
    act(() => {
      result.current.undo();
    });
    expect(result.current.document.activities[0]?.originalDuration).toBe(2400);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);

    // Redo re-applies the edit
    act(() => {
      result.current.redo();
    });
    expect(result.current.document.activities[0]?.originalDuration).toBe(4800);
  });

  it('auto-calculates when settings.autoCalculate is true and preserves summary on cycle error', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    const schedule = (await dataLayer.repository.listSchedules(harbor.id)).find(
      (s) => s.code === 'UP-02',
    )!;
    const initialDocument = makeDocument({
      settings: {
        ...makeDocument().settings,
        autoCalculate: true,
      },
      activities: [
        makeActivity({ id: 'a1', code: 'A1010' }),
        makeActivity({ id: 'a2', code: 'A1020' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' }),
      ],
    });

    const { result } = renderHook(
      () =>
        useScheduleEditor({
          schedule,
          initialDocument,
          initialRevision: schedule.dataRevision,
        }),
      { wrapper: makeWrapper(dataLayer) },
    );

    await act(async () => {
      await result.current.calculate();
    });
    const prevSummary = result.current.summary;
    expect(prevSummary).not.toBeNull();

    // Editing duration triggers auto-calculate
    act(() => {
      result.current.dispatch({
        type: 'updateActivity',
        activityId: 'a1',
        changes: { originalDuration: 4800, remainingDuration: 4800 },
      });
    });
    await waitFor(() => expect(result.current.stale).toBe(false));
    expect(result.current.summary).not.toBe(prevSummary);
    const updatedSummary = result.current.summary;

    // Closing a cycle sets cycleError without overwriting previous summary
    act(() => {
      result.current.dispatch({
        type: 'addRelationship',
        predecessorId: 'a2',
        successorId: 'a1',
        relType: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      });
    });
    await waitFor(() => expect(result.current.cycleError?.code).toBe('SCHEDULE_CYCLE'));
    expect(result.current.summary).toBe(updatedSummary);
  });

  it('keeps unsaved changes in memory when save fails with conflict', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    const schedule = (await dataLayer.repository.listSchedules(harbor.id)).find(
      (s) => s.code === 'UP-02',
    )!;
    const initialDocument = makeDocument({
      activities: [makeActivity({ id: 'a1', code: 'A1010', name: 'Initial' })],
    });

    vi.spyOn(dataLayer.repository, 'saveScheduleDocument').mockRejectedValueOnce(
      new RepositoryError('conflict', 'This schedule was changed elsewhere. Reload and try again.'),
    );

    const { result } = renderHook(
      () =>
        useScheduleEditor({
          schedule,
          initialDocument,
          initialRevision: schedule.dataRevision,
        }),
      { wrapper: makeWrapper(dataLayer) },
    );

    await act(async () => {
      await result.current.enterEdit();
    });
    act(() => {
      result.current.dispatch({
        type: 'updateActivity',
        activityId: 'a1',
        changes: { name: 'Edited offline' },
      });
    });

    let saved = true;
    await act(async () => {
      saved = await result.current.save();
    });
    expect(saved).toBe(false);
    expect(result.current.dirty).toBe(true);
    expect(result.current.document.activities[0]?.name).toBe('Edited offline');
  });
});
