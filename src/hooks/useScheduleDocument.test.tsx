import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSaveScheduleDocument, useScheduleDocument } from '@/hooks/useScheduleDocument';
import { createTestDataLayer, makeImportScheduleInput } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

async function makeUnmaterializedImport(options: { withMapping: boolean }) {
  const dl = createTestDataLayer();
  const metro = dl.store.read().projects.find((p) => p.code === '002')!;
  const imported = await dl.repository.importSchedule(await makeImportScheduleInput(metro.id));
  dl.store.write((db) => {
    const row = db.schedules.find((s) => s.id === imported.id)!;
    row.dataFilePath = null;
    row.dataRevision = 0;
    if (!options.withMapping) {
      row.importMapping = null;
    }
  });
  const [schedule] = await dl.repository.listSchedules(metro.id);
  return { dl, schedule: schedule! };
}

describe('useScheduleDocument', () => {
  it('returns loading when schedule is undefined and loads materialized seeded snapshots', async () => {
    const dl = createTestDataLayer();
    const wrapper = createQueryWrapper(dl);
    const loading = renderHook(() => useScheduleDocument(undefined, 'owner'), { wrapper });
    expect(loading.result.current).toEqual({ status: 'loading' });

    const harbor = dl.store.read().projects.find((p) => p.code === '003')!;
    const up02 = (await dl.repository.listSchedules(harbor.id)).find((s) => s.code === 'UP-02')!;
    const { result } = renderHook(() => useScheduleDocument(up02, 'owner'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.persisted).toBe(true);
    expect(result.current.dataRevision).toBe(1);
    expect(result.current.document.activities).toHaveLength(6);
  });

  it('creates an in-memory blank document for an unmaterialized blank schedule', async () => {
    const dl = createTestDataLayer();
    const wrapper = createQueryWrapper(dl);
    const tower = dl.store.read().projects.find((p) => p.code === '001')!;
    const [main] = await dl.repository.listSchedules(tower.id);
    expect(main!.hasScheduleData).toBe(false);

    const { result } = renderHook(() => useScheduleDocument(main, 'owner'), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.persisted).toBe(false);
    expect(result.current.dataRevision).toBe(0);
    expect(result.current.document.activities).toEqual([]);
    expect(result.current.document.settings.displayMode).toBe('calculated');
  });

  it('returns legacy_import for P2-era imports without a mapping', async () => {
    const { dl, schedule } = await makeUnmaterializedImport({ withMapping: false });
    const { result } = renderHook(() => useScheduleDocument(schedule, 'owner'), {
      wrapper: createQueryWrapper(dl),
    });
    expect(result.current).toEqual({ status: 'legacy_import' });
  });

  it('returns needs_editor for share recipients on unmaterialized P3-era imports', async () => {
    const { dl, schedule } = await makeUnmaterializedImport({ withMapping: true });
    const { result } = renderHook(() => useScheduleDocument(schedule, 'share'), {
      wrapper: createQueryWrapper(dl),
    });
    expect(result.current).toEqual({ status: 'needs_editor' });
  });

  it('materializes P3-era imports in memory for viewers with zero database writes', async () => {
    const { dl, schedule } = await makeUnmaterializedImport({ withMapping: true });
    const materializeSpy = vi.spyOn(dl.repository, 'materializeScheduleDocument');
    const { result } = renderHook(() => useScheduleDocument(schedule, 'viewer'), {
      wrapper: createQueryWrapper(dl),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.persisted).toBe(false);
    expect(result.current.dataRevision).toBe(0);
    expect(result.current.document.activities).toHaveLength(6);
    expect(materializeSpy).not.toHaveBeenCalled();
  });

  it('auto-materializes and persists P3-era imports for editors/owners', async () => {
    const { dl, schedule } = await makeUnmaterializedImport({ withMapping: true });
    const materializeSpy = vi.spyOn(dl.repository, 'materializeScheduleDocument');
    const { result } = renderHook(() => useScheduleDocument(schedule, 'editor'), {
      wrapper: createQueryWrapper(dl),
    });
    expect(result.current.status).toBe('materializing');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') return;
    expect(result.current.persisted).toBe(true);
    expect(result.current.dataRevision).toBe(1);
    expect(result.current.document.activities).toHaveLength(6);
    expect(materializeSpy).toHaveBeenCalledOnce();
    const stored = await dl.repository.getScheduleDocument(schedule.id);
    expect(stored.dataRevision).toBe(1);
    expect(stored.document?.activities).toHaveLength(6);
  });

  it('saves schedule documents through useSaveScheduleDocument and updates revision', async () => {
    const dl = createTestDataLayer();
    const wrapper = createQueryWrapper(dl);
    const harbor = dl.store.read().projects.find((p) => p.code === '003')!;
    const up02 = (await dl.repository.listSchedules(harbor.id)).find((s) => s.code === 'UP-02')!;
    const loaded = await dl.repository.getScheduleDocument(up02.id);
    await dl.repository.acquireScheduleLock(up02.id);

    const { result } = renderHook(() => useSaveScheduleDocument(), { wrapper });
    const saved = await result.current.mutateAsync({
      scheduleId: up02.id,
      expectedRevision: loaded.dataRevision,
      document: loaded.document!,
    });
    expect(saved.dataRevision).toBe(2);
  });
});
