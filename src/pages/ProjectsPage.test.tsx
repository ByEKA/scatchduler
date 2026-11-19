import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function renderProjects(
  options: { dataLayer?: TestDataLayer; team?: boolean; search?: string } = {},
) {
  const dataLayer = options.dataLayer ?? createTestDataLayer();
  const workspace = dataLayer.store
    .read()
    .workspaces.find((w) => w.kind === (options.team ? 'team' : 'personal'))!;
  const utils = renderWithProviders(<ProjectsPage />, {
    route: `/w/${workspace.id}/projects${options.search ?? ''}`,
    path: '/w/:workspaceId/projects',
    dataLayer,
  });
  await screen.findByRole('heading', { level: 1, name: 'Projects' });
  return { ...utils, workspace };
}
const tileNames = () =>
  screen.getAllByRole('article').map((tile) => within(tile).getAllByRole('link')[0]!.textContent);
const search = () => screen.getByRole('searchbox', { name: 'Search projects' });

describe('ProjectsPage', () => {
  it("shows the workspace's counts and its projects as tiles, last updated first", async () => {
    const { user } = await renderProjects();
    expect(await screen.findByText('My workspace · 6 projects · 7 schedules')).toBeInTheDocument();
    await screen.findAllByRole('article');
    expect(tileNames()).toEqual([
      'Riverside Office Tower',
      'Metro Line Extension',
      'Harbor Logistics Hub',
      'Campus Library Retrofit',
      'Northgate Bridge Repair',
      'Old Mill Housing',
    ]);
    expect(within(screen.getAllByRole('article')[3]!).getByText('On hold')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it('shows Not found for a workspace that is not mine', async () => {
    renderWithProviders(<ProjectsPage />, {
      route: '/w/unknown/projects',
      path: '/w/:workspaceId/projects',
    });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows skeletons while the projects load and Retry when they fail', async () => {
    const { unmount } = await renderProjects({
      dataLayer: createTestDataLayer({ overrides: { listProjects: () => new Promise(() => {}) } }),
    });
    expect(await screen.findAllByTestId('project-card-skeleton')).toHaveLength(4);
    unmount();
    await renderProjects({
      dataLayer: createTestDataLayer({
        overrides: {
          listProjects: () => Promise.reject(new RepositoryError('network', 'offline')),
        },
      }),
    });
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('searches with Turkish folding and keeps the search in the URL', async () => {
    const { user } = await renderProjects();
    await screen.findAllByRole('article');
    await user.type(search(), 'RİVERSİDE');
    await waitFor(() => expect(tileNames()).toEqual(['Riverside Office Tower']));
    expect(screen.getByTestId('location').textContent).toMatch(/\?q=/);
  });

  it('filters by status and stage from the URL and counts the filters', async () => {
    await renderProjects({ search: '?status=active&stage=construction' });
    await waitFor(() =>
      expect(tileNames()).toEqual(['Riverside Office Tower', 'Harbor Logistics Hub']),
    );
    expect(screen.getByRole('button', { name: 'Filters · 2' })).toBeInTheDocument();
    expect(screen.getByText('Stage: Construction')).toBeInTheDocument();
  });

  it('sorts by name and by status date, nulls last', async () => {
    const { unmount } = await renderProjects({ search: '?sort=name' });
    await waitFor(() => expect(tileNames()[0]).toBe('Campus Library Retrofit'));
    unmount();
    await renderProjects({ search: '?sort=status-date' });
    await waitFor(() =>
      expect(tileNames()).toEqual([
        'Riverside Office Tower',
        'Harbor Logistics Hub',
        'Campus Library Retrofit',
        'Old Mill Housing',
        'Metro Line Extension',
        'Northgate Bridge Repair',
      ]),
    );
  });

  it('switches to the list layout with a menu per row, and remembers it', async () => {
    const { user, unmount, dataLayer, workspace } = await renderProjects();
    await screen.findAllByRole('article');
    await user.click(screen.getByRole('radio', { name: 'List' }));
    const table = screen.getByRole('table', { name: 'Projects' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Project',
      'Status',
      'Stage',
      'Type',
      'Client',
      'City',
      'Status date',
      'Schedules',
      'Actions',
    ]);
    const riverside = dataLayer.store.read().projects.find((p) => p.code === '001')!;
    const link = within(table).getByRole('link', { name: 'Riverside Office Tower' });
    expect(link).toHaveAttribute('href', `/w/${workspace.id}/p/${riverside.id}/files`);
    expect(link).toHaveAttribute(
      'title',
      'Riverside Office Tower\n001\nRiverside Holding\nIstanbul',
    );
    const millRow = within(table).getByRole('link', { name: 'Old Mill Housing' }).closest('tr')!;
    expect(within(millRow).getByText('—')).toBeInTheDocument();
    expect(
      within(millRow).getByRole('button', { name: 'Actions for Old Mill Housing' }),
    ).toBeInTheDocument();
    expect(table).not.toHaveTextContent('null');
    unmount();
    await renderProjects({ dataLayer });
    expect(await screen.findByRole('table', { name: 'Projects' })).toBeInTheDocument();
  });

  it('shows the empty workspace to editors and viewers, and clears a search that matches nothing', async () => {
    const { unmount } = await renderProjects({
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Create a project to organize its schedules.')).toBeInTheDocument();
    unmount();
    const viewer = createTestDataLayer({ teamRole: 'viewer' });
    viewer.store.write((db) => {
      db.projects = db.projects.filter((p) => p.code !== 'T-01');
    });
    const second = await renderProjects({ dataLayer: viewer, team: true });
    expect(
      await screen.findByText('Projects in this workspace will appear here.'),
    ).toBeInTheDocument();
    second.unmount();
    const { user } = await renderProjects();
    await screen.findAllByRole('article');
    await user.type(search(), 'zzz');
    expect(await screen.findByText('No matching projects')).toBeInTheDocument();
    expect(screen.getByText('Try other words or clear the filters.')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear filters' }).at(-1)!);
    expect(screen.getAllByRole('article')).toHaveLength(6);
  });

  it('keeps viewers from creating and tells them why', async () => {
    const { user } = await renderProjects({
      dataLayer: createTestDataLayer({ teamRole: 'viewer' }),
      team: true,
    });
    const newProject = await screen.findByRole('button', { name: 'New project' });
    expect(newProject).toHaveAttribute('aria-disabled', 'true');
    await user.hover(newProject);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      "Viewers can't make changes in this workspace",
    );
    await user.click(newProject);
    expect(screen.getByTestId('dialog')).toHaveTextContent('none');
  });

  it('opens the members of a team workspace and has no Members button in a personal one', async () => {
    const team = await renderProjects({ team: true });
    await team.user.click(await screen.findByRole('button', { name: 'Members' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('workspaceMembers');
    team.unmount();
    await renderProjects();
    expect(screen.queryByRole('button', { name: 'Members' })).not.toBeInTheDocument();
  });

  it('focuses the heading once a deleted project has left the page', async () => {
    const { user } = await renderProjects();
    await screen.findAllByRole('article');
    await user.click(screen.getByRole('button', { name: 'Actions for Old Mill Housing' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Old Mill Housing?' });
    await user.type(within(dialog).getByLabelText('Project ID'), '006{Enter}');
    expect(await screen.findByText('Project deleted')).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toHaveFocus(),
    );
  });
});
