import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { useCreateProject, useProjectCodeAvailable, useRecentProjects } from '@/hooks/useProjects';
import { useCreateSchedule, useImportSchedule } from '@/hooks/useSchedules';
import { usePendingTasks, useSetTaskDone } from '@/hooks/useTasks';
import { useCreateTeamWorkspace, useWorkspaces } from '@/hooks/useWorkspaces';
import { createTestDataLayer, makeNewProjectInput } from '@/test/fakes';
import { createQueryWrapper } from '@/test/render';

describe('data hooks', () => {
  it('useRecentProjects returns the five most recent projects', async () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(() => useRecentProjects(workspaceId), {
      wrapper: createQueryWrapper(dl),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((p) => p.code)).toEqual(['001', '002', '003', '004', '005']);
  });

  it('useCreateProject refreshes recent projects', async () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(
      () => ({ recent: useRecentProjects(workspaceId), create: useCreateProject() }),
      {
        wrapper: createQueryWrapper(dl),
      },
    );
    await waitFor(() => expect(result.current.recent.isSuccess).toBe(true));
    await act(() =>
      result.current.create.mutateAsync(
        makeNewProjectInput(workspaceId, { code: '007', name: 'Pier 9' }),
      ),
    );
    await waitFor(() => expect(result.current.recent.data?.[0]?.code).toBe('007'));
  });

  it('useSetTaskDone removes the task at once and restores it when the write fails', async () => {
    let fail: (error: unknown) => void = () => {};
    const dl = createTestDataLayer({
      overrides: {
        setTaskDone: () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      },
    });
    const { result } = renderHook(() => ({ tasks: usePendingTasks(), setDone: useSetTaskDone() }), {
      wrapper: createQueryWrapper(dl),
    });
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(3));
    act(() =>
      result.current.setDone.mutate({ taskId: result.current.tasks.data![0]!.id, done: true }),
    );
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(2));
    act(() => fail(new RepositoryError('network', 'offline')));
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(3));
  });

  it('useSetTaskDone brings the task back from its snapshot, not only from the refetch', async () => {
    let fail: (error: unknown) => void = () => {};
    const dl = createTestDataLayer({
      overrides: {
        setTaskDone: () =>
          new Promise((_, reject) => {
            fail = reject;
          }),
      },
    });
    const listPendingTasks = dl.repository.listPendingTasks.bind(dl.repository);
    let calls = 0;
    // The first read is real; the refetch after the failed write never settles.
    dl.repository.listPendingTasks = () =>
      calls++ === 0 ? listPendingTasks() : new Promise(() => {});
    const { result } = renderHook(() => ({ tasks: usePendingTasks(), setDone: useSetTaskDone() }), {
      wrapper: createQueryWrapper(dl),
    });
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(3));
    act(() =>
      result.current.setDone.mutate({ taskId: result.current.tasks.data![0]!.id, done: true }),
    );
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(2));
    act(() => fail(new RepositoryError('network', 'offline')));
    await waitFor(() => expect(result.current.tasks.data).toHaveLength(3));
  });

  it('schedule mutations move their project to the top of recent projects', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const workspaceId = db.workspaces[0]!.id;
    const projectId = (code: string) => db.projects.find((p) => p.code === code)!.id;
    const { result } = renderHook(
      () => ({
        recent: useRecentProjects(workspaceId),
        create: useCreateSchedule(),
        importSchedule: useImportSchedule(),
      }),
      { wrapper: createQueryWrapper(dl) },
    );
    await waitFor(() => expect(result.current.recent.isSuccess).toBe(true));
    await act(() => result.current.create.mutateAsync({ projectId: projectId('006'), name: 'B' }));
    await waitFor(() => expect(result.current.recent.data?.[0]?.code).toBe('006'));
    await act(() =>
      result.current.importSchedule.mutateAsync({
        projectId: projectId('005'),
        name: 'Rev 2',
        file: new File(['x'], 'rev2.xer'),
      }),
    );
    await waitFor(() => expect(result.current.recent.data?.[0]?.code).toBe('005'));
  });

  it('project and team workspace mutations refresh the workspace list', async () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(
      () => ({
        workspaces: useWorkspaces(),
        createProject: useCreateProject(),
        createTeam: useCreateTeamWorkspace(),
      }),
      { wrapper: createQueryWrapper(dl) },
    );
    await waitFor(() => expect(result.current.workspaces.data?.[0]?.projectCount).toBe(6));
    await act(() =>
      result.current.createProject.mutateAsync(makeNewProjectInput(workspaceId, { code: '007' })),
    );
    await waitFor(() => expect(result.current.workspaces.data?.[0]?.projectCount).toBe(7));
    await act(() => result.current.createTeam.mutateAsync({ name: 'Field crew' }));
    await waitFor(() =>
      expect(result.current.workspaces.data?.map((w) => w.name)).toContain('Field crew'),
    );
  });

  it('useProjectCodeAvailable stays idle for malformed IDs', () => {
    const dl = createTestDataLayer();
    const workspaceId = dl.store.read().workspaces[0]!.id;
    const { result } = renderHook(() => useProjectCodeAvailable(workspaceId, 'a b'), {
      wrapper: createQueryWrapper(dl),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
