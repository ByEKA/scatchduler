import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  useCreateProgram,
  useDeleteProgram,
  useRenameProgram,
  useWorkspacePrograms,
} from '@/hooks/usePrograms';
import { useProject } from '@/hooks/useProjects';
import { createTestDataLayer } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

describe('usePrograms', () => {
  it('queries workspace programs and invalidates projects when renaming or deleting a program', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personalId = db.workspaces.find((w) => w.kind === 'personal')!.id;
    const harborId = db.projects.find((p) => p.code === '003')!.id;
    const wrapper = createQueryWrapper(dataLayer);

    const programsHook = renderHook(() => useWorkspacePrograms(personalId), { wrapper });
    const harborHook = renderHook(() => useProject(personalId, harborId), { wrapper });
    const createHook = renderHook(() => useCreateProgram(), { wrapper });
    const renameHook = renderHook(() => useRenameProgram(), { wrapper });
    const deleteHook = renderHook(() => useDeleteProgram(), { wrapper });

    await waitFor(() => expect(programsHook.result.current.data).toHaveLength(1));
    await waitFor(() =>
      expect(harborHook.result.current.data?.programName).toBe('Port & Industrial Program'),
    );

    const seededProgramId = programsHook.result.current.data![0]!.id;
    await renameHook.result.current.mutateAsync({
      programId: seededProgramId,
      name: 'Maritime & Logistics',
    });

    await waitFor(() =>
      expect(harborHook.result.current.data?.programName).toBe('Maritime & Logistics'),
    );

    await createHook.result.current.mutateAsync({
      workspaceId: personalId,
      name: 'Building Program',
    });
    await waitFor(() =>
      expect(programsHook.result.current.data?.map((p) => p.name)).toEqual([
        'Building Program',
        'Maritime & Logistics',
      ]),
    );

    await deleteHook.result.current.mutateAsync(seededProgramId);
    await waitFor(() => expect(harborHook.result.current.data?.programId).toBeNull());
    expect(harborHook.result.current.data?.programName).toBeNull();
  });
});
