import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useCreateFolder,
  useDeleteFolder,
  useProjectFolders,
  useRenameFolder,
} from '@/hooks/useFolders';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useCopySchedule, useMoveSchedulesToFolder } from '@/hooks/useSchedules';
import { createTestDataLayer } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

describe('useFolders and schedule folder/copy hooks', () => {
  it('queries folders, moves schedules, duplicates schedules, and re-parents on folder deletion', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const harborId = db.projects.find((p) => p.code === '003')!.id;
    const wrapper = createQueryWrapper(dataLayer);

    const foldersHook = renderHook(() => useProjectFolders(harborId), { wrapper });
    const schedulesHook = renderHook(() => useProjectSchedules(harborId), { wrapper });
    const createFolderHook = renderHook(() => useCreateFolder(), { wrapper });
    const renameFolderHook = renderHook(() => useRenameFolder(), { wrapper });
    const deleteFolderHook = renderHook(() => useDeleteFolder(), { wrapper });
    const moveHook = renderHook(() => useMoveSchedulesToFolder(), { wrapper });
    const copyHook = renderHook(() => useCopySchedule(), { wrapper });

    await waitFor(() =>
      expect(foldersHook.result.current.data?.map((f) => f.name)).toEqual([
        'Baselines',
        'Monthly Updates',
      ]),
    );
    await waitFor(() => expect(schedulesHook.result.current.data).toHaveLength(3));

    const updatesFolder = foldersHook.result.current.data!.find(
      (f) => f.name === 'Monthly Updates',
    )!;
    const childFolder = await createFolderHook.result.current.mutateAsync({
      projectId: harborId,
      parentId: updatesFolder.id,
      name: 'Q4 Updates',
    });

    await renameFolderHook.result.current.mutateAsync({
      folderId: childFolder.id,
      name: '2026 Q4',
    });
    await waitFor(() =>
      expect(foldersHook.result.current.data?.find((f) => f.id === childFolder.id)?.name).toBe(
        '2026 Q4',
      ),
    );

    const up2 = schedulesHook.result.current.data!.find((s) => s.code === 'UP-02')!;
    const duplicate = await copyHook.result.current.mutateAsync({
      scheduleId: up2.id,
      name: 'Update 2 Copy',
      code: 'UP-02-C',
      folderId: childFolder.id,
    });
    expect(duplicate.copiedFromId).toBe(up2.id);
    expect(duplicate.folderId).toBe(childFolder.id);

    await waitFor(() => expect(schedulesHook.result.current.data).toHaveLength(4));

    await deleteFolderHook.result.current.mutateAsync(childFolder.id);
    await waitFor(() =>
      expect(schedulesHook.result.current.data?.find((s) => s.id === duplicate.id)?.folderId).toBe(
        updatesFolder.id,
      ),
    );

    await moveHook.result.current.mutateAsync({
      scheduleIds: [duplicate.id],
      folderId: null,
    });
    await waitFor(() =>
      expect(
        schedulesHook.result.current.data?.find((s) => s.id === duplicate.id)?.folderId,
      ).toBeNull(),
    );
  });
});
