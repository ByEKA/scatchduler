import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { queryKeys } from '@/hooks/query-keys';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function Probe() {
  const ctx = useCurrentContext();
  return (
    <div>
      <p data-testid="ctx">{`${ctx.status}|${ctx.workspace?.name ?? '-'}|${ctx.project?.code ?? '-'}`}</p>
      <button onClick={() => ctx.setProject(ctx.projects.find((p) => p.code === '003')!.id)}>
        pick 003
      </button>
      <button onClick={() => ctx.setWorkspace(ctx.workspaces[1]!.id)}>pick team</button>
    </div>
  );
}

describe('useCurrentContext', () => {
  it('falls back to the personal workspace and its most recent project', async () => {
    renderWithProviders(<Probe />, { route: '/home', path: '/home' });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|001'),
    );
  });

  it('prefers ids from the URL and remembers them', async () => {
    const dl = createTestDataLayer();
    const team = dl.store.read().workspaces[1]!;
    renderWithProviders(<Probe />, {
      route: `/w/${team.id}/projects`,
      path: '/w/:workspaceId/projects',
      dataLayer: dl,
    });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|Site Operations|T-01'),
    );
    expect(localStorage.getItem('ui.lastWorkspaceId')).toBe(team.id);
  });

  it('uses the stored project and ignores stored ids that no longer exist', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    localStorage.setItem('ui.lastWorkspaceId', 'missing-id');
    localStorage.setItem(
      `ui.lastProjectId.${db.workspaces[0]!.id}`,
      db.projects.find((p) => p.code === '003')!.id,
    );
    renderWithProviders(<Probe />, { route: '/home', path: '/home', dataLayer: dl });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|003'),
    );
  });

  it('keeps the current project section when switching projects', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    const { user } = renderWithProviders(<Probe />, {
      route: `/w/${personal.id}/p/${riverside.id}/dashboard`,
      path: '/w/:workspaceId/p/:projectId/dashboard',
      dataLayer: dl,
    });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|001'),
    );
    await user.click(screen.getByRole('button', { name: 'pick 003' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/w/${personal.id}/p/${harbor.id}/dashboard`,
    );
  });

  it('opens the projects page of a newly picked workspace', async () => {
    const dl = createTestDataLayer();
    const team = dl.store.read().workspaces[1]!;
    const { user } = renderWithProviders(<Probe />, { route: '/home', dataLayer: dl });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready'));
    await user.click(screen.getByRole('button', { name: 'pick team' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${team.id}/projects`);
    expect(localStorage.getItem('ui.lastWorkspaceId')).toBe(team.id);
  });

  it('reports an error when workspaces fail to load', async () => {
    renderWithProviders(<Probe />, {
      route: '/home',
      path: '/home',
      dataLayer: createTestDataLayer({ failRate: 1 }),
    });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('error|-|-'));
  });

  it('has no project in an empty workspace', async () => {
    renderWithProviders(<Probe />, {
      route: '/home',
      path: '/home',
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|-'),
    );
  });

  it('stays ready when a refetch fails after workspaces have loaded', async () => {
    const dl = createTestDataLayer();
    const { queryClient } = renderWithProviders(<Probe />, {
      route: '/home',
      path: '/home',
      dataLayer: dl,
    });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|001'),
    );
    dl.repository.listWorkspaces = () => Promise.reject(new RepositoryError('network', 'offline'));
    await act(() => queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() }));
    expect(queryClient.getQueryState(queryKeys.workspaces())?.status).toBe('error');
    // Query observers hear about the failure on a later tick; let it pass before checking.
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|001');
  });

  it("reports an error when the workspace's projects fail to load", async () => {
    const dataLayer = createTestDataLayer({
      overrides: { listProjects: () => Promise.reject(new RepositoryError('network', 'offline')) },
    });
    renderWithProviders(<Probe />, { route: '/home', path: '/home', dataLayer });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('error|My workspace|-'),
    );
  });

  it('remembers a project picked on a page without ids and stays on that page', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const harbor = db.projects.find((p) => p.code === '003')!;
    const { user } = renderWithProviders(<Probe />, {
      route: '/home',
      path: '/home',
      dataLayer: dl,
    });
    await waitFor(() => expect(screen.getByTestId('ctx')).toHaveTextContent('ready'));
    await user.click(screen.getByRole('button', { name: 'pick 003' }));
    expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|003');
    expect(screen.getByTestId('location')).toHaveTextContent('/home');
    expect(localStorage.getItem(`ui.lastProjectId.${db.workspaces[0]!.id}`)).toBe(harbor.id);
  });

  it('remembers the project named in the URL', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    renderWithProviders(<Probe />, {
      route: `/w/${personal.id}/p/${harbor.id}/files`,
      path: '/w/:workspaceId/p/:projectId/files',
      dataLayer: dl,
    });
    await waitFor(() =>
      expect(screen.getByTestId('ctx')).toHaveTextContent('ready|My workspace|003'),
    );
    expect(localStorage.getItem(`ui.lastProjectId.${personal.id}`)).toBe(harbor.id);
  });

  it('passes on the error of the list that failed to load', async () => {
    const offline = new RepositoryError('network', 'offline');
    function ErrorProbe() {
      const { status, error } = useCurrentContext();
      return (
        <p data-testid="error">{`${status}|${error === offline ? 'offline' : String(error)}`}</p>
      );
    }
    const dataLayer = createTestDataLayer({
      overrides: { listProjects: () => Promise.reject(offline) },
    });
    renderWithProviders(<ErrorProbe />, { route: '/home', path: '/home', dataLayer });
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('error|offline'));
  });
});
