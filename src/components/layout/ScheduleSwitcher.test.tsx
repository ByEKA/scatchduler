import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleSwitcher } from '@/components/layout/ScheduleSwitcher';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function renderSwitcher(route: string, options: { dataLayer?: TestDataLayer; path?: string } = {}) {
  const dataLayer = options.dataLayer ?? createTestDataLayer();
  return renderWithProviders(<ScheduleSwitcher />, {
    route,
    path: options.path ?? '/w/:workspaceId/p/:projectId/schedule',
    dataLayer,
  });
}

describe('ScheduleSwitcher', () => {
  it('stays hidden on /home and /w/:ws/p/:proj/files', async () => {
    const dataLayer = createTestDataLayer();
    const project = dataLayer.store.read().projects.find((p) => p.code === '003')!;

    const home = renderSwitcher('/home', { dataLayer, path: '/home' });
    expect(screen.queryByRole('button', { name: 'Switch schedule' })).not.toBeInTheDocument();
    home.unmount();

    renderSwitcher(`/w/${project.workspaceId}/p/${project.id}/files`, {
      dataLayer,
      path: '/w/:workspaceId/p/:projectId/files',
    });
    expect(screen.queryByRole('button', { name: 'Switch schedule' })).not.toBeInTheDocument();
  });

  it('shows active schedule, hides archived schedules, filters by search, shows lock icon, and navigates on pick', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    const library = dataLayer.store.read().projects.find((p) => p.code === '004')!;
    const mert = dataLayer.store.read().users.find((u) => u.firstName === 'Mert')!;

    dataLayer.store.write((db) => {
      const update1 = db.schedules.find((s) => s.projectId === harbor.id && s.code === 'UP-01')!;
      update1.lock = {
        userId: mert.id,
        userName: 'Mert Demir',
        lockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });

    const { user, unmount } = renderSwitcher(`/w/${harbor.workspaceId}/p/${harbor.id}/schedule`, {
      dataLayer,
    });

    const trigger = await screen.findByRole('button', { name: 'Switch schedule' });
    expect(trigger).toHaveTextContent('Update 2');

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: 'Switch schedule' });
    expect(within(dialog).getByText('Update 2')).toBeInTheDocument();
    expect(within(dialog).getByText('Update 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Baseline')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Being edited by Mert Demir')).toBeInTheDocument();

    const search = within(dialog).getByPlaceholderText('Search schedules…');
    await user.type(search, 'UP-01');
    expect(within(dialog).getByText('Update 1')).toBeInTheDocument();
    expect(within(dialog).queryByText('Baseline')).not.toBeInTheDocument();

    const update1Id = dataLayer.store
      .read()
      .schedules.find((s) => s.projectId === harbor.id && s.code === 'UP-01')!.id;
    await user.click(within(dialog).getByText('Update 1'));
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/w/${harbor.workspaceId}/p/${harbor.id}/schedule?scheduleId=${update1Id}`,
    );
    unmount();

    // Verify archived schedule ("Recovery plan draft") is excluded on project 004
    const lib = renderSwitcher(`/w/${library.workspaceId}/p/${library.id}/schedule`, { dataLayer });
    const libTrigger = await screen.findByRole('button', { name: 'Switch schedule' });
    expect(libTrigger).toHaveTextContent('Recovery plan');
    await lib.user.click(libTrigger);
    const libDialog = await screen.findByRole('dialog', { name: 'Switch schedule' });
    expect(within(libDialog).getByText('Recovery plan')).toBeInTheDocument();
    expect(within(libDialog).getByText('Baseline')).toBeInTheDocument();
    expect(within(libDialog).queryByText('Recovery plan draft')).not.toBeInTheDocument();
  });
});
