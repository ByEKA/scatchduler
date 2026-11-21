import { act, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Role } from '@/data/types';
import { ScheduleMenu } from '@/features/files/ScheduleMenu';
import { saveFile } from '@/lib/download';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

vi.mock('@/lib/download', () => ({ saveFile: vi.fn() }));

async function renderMenu(
  projectCode: string,
  scheduleCode: string,
  options: { teamRole?: Role; dataLayer?: TestDataLayer } = {},
) {
  const dataLayer = options.dataLayer ?? createTestDataLayer({ teamRole: options.teamRole });
  const db = dataLayer.store.read();
  const projectId = db.projects.find((p) => p.code === projectCode)!.id;
  const project = await dataLayer.repository.getProject(projectId);
  const workspace = (await dataLayer.repository.listWorkspaces()).find(
    (w) => w.id === project.workspaceId,
  )!;
  const schedules = await dataLayer.repository.listSchedules(projectId);
  const schedule = schedules.find((s) => s.code === scheduleCode)!;
  const utils = renderWithProviders(
    <ScheduleMenu
      schedule={schedule}
      schedules={schedules}
      project={project}
      workspace={workspace}
    />,
    { dataLayer },
  );
  await utils.user.click(screen.getByRole('button', { name: `Actions for ${schedule.name}` }));
  return { ...utils, schedule, dataLayer };
}
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('ScheduleMenu', () => {
  it('offers what the role and the schedule state allow', async () => {
    const current = await renderMenu('004', 'RP-01');
    expect(items()).toEqual(['Open', 'Edit details']);
    current.unmount();
    const baseline = await renderMenu('004', 'BL-01');
    expect(items()).toEqual(['Open', 'Make current', 'Edit details', 'Archive', 'Delete']);
    baseline.unmount();
    const draft = await renderMenu('004', 'RP-00');
    expect(items()).toEqual(['Open', 'Edit details', 'Restore', 'Delete']);
    draft.unmount();
    await renderMenu('T-01', 'BL-03', { teamRole: 'viewer' });
    expect(items()).toEqual(['Open']);
  });

  it('opens the schedule route when "Open" is selected', async () => {
    const { user, schedule } = await renderMenu('004', 'BL-01');
    const open = screen.getByRole('menuitem', { name: 'Open' });
    expect(open).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(open);
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/p/${schedule.projectId}/schedule?scheduleId=${schedule.id}`,
    );
  });

  it('makes a schedule current and archives another, with their toasts', async () => {
    const first = await renderMenu('003', 'UP-01');
    await first.user.click(screen.getByRole('menuitem', { name: 'Make current' }));
    expect(await screen.findByText('Schedule is now current')).toBeInTheDocument();
    expect(
      first.dataLayer.store.read().schedules.find((s) => s.code === 'UP-01' && s.isCurrent),
    ).toBeDefined();
    first.unmount();
    const second = await renderMenu('003', 'BL-01');
    await second.user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    expect(await screen.findByText('Schedule archived')).toBeInTheDocument();
  });

  it('deletes a schedule after confirming, once for two quick clicks', async () => {
    const { user, dataLayer } = await renderMenu('004', 'BL-01');
    const remove = vi.spyOn(dataLayer.repository, 'deleteSchedules');
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Baseline?' });
    expect(dialog).toHaveAccessibleDescription(
      "This can't be undone. Stored original files are deleted too.",
    );
    const confirm = within(dialog).getByRole('button', { name: 'Delete' });
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(await screen.findByText('Schedule deleted')).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("downloads an import's original and opens its report", async () => {
    const dataLayer = createTestDataLayer();
    const { makeImportScheduleInput } = await import('@/test/fakes');
    const metro = dataLayer.store.read().projects.find((p) => p.code === '002')!;
    await dataLayer.repository.importSchedule(await makeImportScheduleInput(metro.id));
    const { user } = await renderMenu('002', 'NTH-A', { dataLayer });
    await user.click(screen.getByRole('menuitem', { name: 'Download original file' }));
    await vi.waitFor(() =>
      expect(vi.mocked(saveFile)).toHaveBeenCalledWith(expect.any(File), 'two-projects.xer'),
    );
    await user.click(screen.getByRole('button', { name: 'Actions for North Plant' }));
    await user.click(screen.getByRole('menuitem', { name: 'View import report' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('importReport');
  });

  it('allows owners to delete the current schedule when it is the only one', async () => {
    await renderMenu('001', 'MS-01');
    expect(items()).toEqual(['Open', 'Edit details', 'Delete']);
  });

  it('keeps a failed delete in the dialog and returns focus to the trigger on cancel', async () => {
    const { RepositoryError } = await import('@/data/errors');
    const { user, dataLayer } = await renderMenu('004', 'BL-01');
    vi.spyOn(dataLayer.repository, 'deleteSchedules').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Baseline?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: 'Actions for Baseline' })).toHaveFocus(),
    );
  });
});
