import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectFilesPage } from '@/pages/ProjectFilesPage';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function renderFiles(
  code: string,
  options: { dataLayer?: TestDataLayer; search?: string; workspaceId?: string } = {},
) {
  const dataLayer = options.dataLayer ?? createTestDataLayer();
  const project = dataLayer.store.read().projects.find((p) => p.code === code)!;
  const utils = renderWithProviders(<ProjectFilesPage />, {
    route: `/w/${options.workspaceId ?? project.workspaceId}/p/${project.id}/files${options.search ?? ''}`,
    path: '/w/:workspaceId/p/:projectId/files',
    dataLayer,
  });
  return { ...utils, project };
}
const rowNames = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]!.textContent);

describe('ProjectFilesPage', () => {
  it("shows Not found for an unknown project, another workspace's and a share-only one", async () => {
    const dataLayer = createTestDataLayer();
    const { unmount } = renderFiles('001', {
      dataLayer,
      workspaceId: dataLayer.store.read().workspaces[1]!.id,
    });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    unmount();
    const shared = createTestDataLayer();
    shared.store.write((db) => {
      const mert = db.users.find((u) => u.firstName === 'Mert')!;
      const other = {
        id: crypto.randomUUID(),
        name: 'Northline Contractors',
        kind: 'team' as const,
        createdAt: db.seededAt,
      };
      db.workspaces.push(other);
      db.members.push({
        workspaceId: other.id,
        userId: mert.id,
        role: 'owner',
        joinedAt: db.seededAt,
      });
      db.projects.push({
        ...db.projects[0]!,
        id: crypto.randomUUID(),
        workspaceId: other.id,
        code: 'N-01',
        name: 'Coastal Road Widening',
      });
    });
    renderFiles('N-01', { dataLayer: shared });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('shows a skeleton with hidden text while the project loads', () => {
    renderFiles('001', {
      dataLayer: createTestDataLayer({ overrides: { getProject: () => new Promise(() => {}) } }),
    });
    expect(screen.getByText('Loading project…')).toBeInTheDocument();
  });

  it('shows the header and opens the dialogs for this project', async () => {
    const { user, project } = renderFiles('003');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Harbor Logistics Hub/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Aegean Ports · Izmir')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New schedule' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newSchedule');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Edit project' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('editProject');
    expect(project.code).toBe('003');
  });

  it('shows the counters and navigates via "Open current schedule" and schedule name links', async () => {
    const { user, project } = renderFiles('004');
    const counters = await screen.findByRole('region', { name: 'Project summary' });
    expect(within(counters).getByText('Schedules').nextElementSibling).toHaveTextContent('2');
    expect(within(counters).getByText('Current schedule').nextElementSibling).toHaveTextContent(
      'Recovery plan',
    );
    const open = screen.getByRole('link', { name: 'Open current schedule' });
    expect(open).toHaveAttribute(
      'href',
      expect.stringContaining(`/w/${project.workspaceId}/p/${project.id}/schedule?scheduleId=`),
    );
    await user.click(open);
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/w/${project.workspaceId}/p/${project.id}/schedule?scheduleId=`,
    );
  });

  it('shows a lock indicator with tooltip when a schedule is actively locked', async () => {
    const dataLayer = createTestDataLayer();
    dataLayer.store.write((db) => {
      const library = db.projects.find((p) => p.code === '004')!;
      const mert = db.users.find((u) => u.firstName === 'Mert')!;
      const schedule = db.schedules.find((s) => s.projectId === library.id && s.isCurrent)!;
      schedule.lock = {
        userId: mert.id,
        userName: 'Mert Demir',
        lockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
    const { user } = renderFiles('004', { dataLayer });
    const table = await screen.findByRole('table', { name: 'Schedules' });
    const indicator = await within(table).findByLabelText('Being edited by Mert Demir');
    expect(indicator).toBeInTheDocument();
    await user.hover(indicator);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Being edited by Mert Demir');
  });

  it('lists the schedules with their columns and shows archived ones when asked', async () => {
    const { user, project } = renderFiles('004');
    const table = await screen.findByRole('table', { name: 'Schedules' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Name',
      'Code',
      'Tags',
      'Status date',
      'Update',
      'Last modified',
      'Activities',
      'Source',
      'Notes',
      'Actions',
    ]);
    await waitFor(() => expect(rowNames(table)).toEqual(['Recovery plan', 'Baseline']));
    const recoveryLink = within(table).getByRole('link', { name: 'Recovery plan' });
    expect(recoveryLink).toHaveAttribute(
      'title',
      'Recovery plan\nRP-01\nAgreed with the client on site.',
    );
    expect(recoveryLink).toHaveAttribute(
      'href',
      expect.stringContaining(`/w/${project.workspaceId}/p/${project.id}/schedule?scheduleId=`),
    );
    expect(within(within(table).getAllByRole('row')[1]!).getByText('Current')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Show archived' }));
    expect(screen.getByTestId('location')).toHaveTextContent('archived=1');
    await waitFor(() =>
      expect(rowNames(table)).toEqual(['Recovery plan', 'Recovery plan draftArchived', 'Baseline']),
    );
  });

  it('shows "—" for missing values, never "null", for a P2-era schedule', async () => {
    const dataLayer = createTestDataLayer();
    dataLayer.store.write((db) => {
      const library = db.projects.find((p) => p.code === '004')!;
      db.schedules.push({
        ...db.schedules.find((s) => s.projectId === library.id)!,
        id: crypto.randomUUID(),
        name: 'Old import',
        code: null,
        statusDate: null,
        notes: null,
        isCurrent: false,
        baseline: 'none',
        updateNumber: null,
        source: 'import',
        sourceFileName: 'old.xer',
        sourceFormat: 'xer',
      });
    });
    renderFiles('004', { dataLayer });
    const table = await screen.findByRole('table', { name: 'Schedules' });
    const row = (await within(table).findByText('Old import')).closest('tr')!;
    expect(within(row).getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(within(row).getByText('Imported · old.xer')).toBeInTheDocument();
    expect(table).not.toHaveTextContent('null');
  });

  it('shows the empty state to editors and viewers', async () => {
    const { unmount } = renderFiles('002');
    expect(
      await screen.findByText('Create a blank schedule or import one from your planning tool.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Import schedule' })).toHaveLength(2);
    unmount();
    const viewer = createTestDataLayer({ teamRole: 'viewer' });
    viewer.store.write((db) => {
      const tunnel = db.projects.find((p) => p.code === 'T-01')!;
      db.schedules = db.schedules.filter((s) => s.projectId !== tunnel.id);
    });
    renderFiles('T-01', { dataLayer: viewer });
    expect(
      await screen.findByText('Schedules in this project will appear here.'),
    ).toBeInTheDocument();
  });

  it('keeps viewers from writing and tells them why', async () => {
    const { user } = renderFiles('T-01', {
      dataLayer: createTestDataLayer({ teamRole: 'viewer' }),
    });
    const newSchedule = await screen.findByRole('button', { name: 'New schedule' });
    expect(newSchedule).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Import schedule' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.hover(newSchedule);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      "Viewers can't make changes in this workspace",
    );
    await user.click(screen.getByRole('button', { name: 'Project details' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('editProject');
  });
});
