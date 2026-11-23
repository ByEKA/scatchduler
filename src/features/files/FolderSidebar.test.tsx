import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { Schedule, WorkspaceSummary } from '@/data/types';
import { FolderSidebar, type FolderSelection } from '@/features/files/FolderSidebar';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function Harness({
  projectId,
  workspace,
}: {
  projectId: string;
  workspace: WorkspaceSummary;
}) {
  const [selectedFolder, setSelectedFolder] = useState<FolderSelection>('all');
  const schedulesQuery = useProjectSchedules(projectId);
  const schedules: readonly Schedule[] = schedulesQuery.data ?? [];

  return (
    <FolderSidebar
      projectId={projectId}
      workspace={workspace}
      schedules={schedules}
      selectedFolder={selectedFolder}
      onSelectFolder={setSelectedFolder}
    />
  );
}

describe('FolderSidebar', () => {
  it('renders All schedules, Unfiled, and seeded folders with counts, supports 3-level folder CRUD, and disables writes for viewers', async () => {
    const user = userEvent.setup();
    const dataLayer = createTestDataLayer();
    const workspaces = await dataLayer.repository.listWorkspaces();
    const personal = workspaces.find((w) => w.kind === 'personal')!;
    const projects = await dataLayer.repository.listProjects(personal.id);
    const harbor = projects.find((p) => p.code === '003')!;

    const { unmount } = renderWithProviders(
      <Harness projectId={harbor.id} workspace={personal} />,
      { dataLayer },
    );

    const nav = await screen.findByRole('navigation', { name: 'Folders' });
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: /^Baselines/i })).toBeInTheDocument();
    });

    expect(within(nav).getByRole('button', { name: /^All schedules/i })).toHaveTextContent('3');
    expect(within(nav).getByRole('button', { name: /^Unfiled/i })).toHaveTextContent('0');
    expect(within(nav).getByRole('button', { name: /^Baselines/i })).toHaveTextContent('1');
    expect(within(nav).getByRole('button', { name: /^Monthly Updates/i })).toHaveTextContent('2');

    // Create a root folder "Tender"
    await user.click(within(nav).getByRole('button', { name: 'New folder' }));
    const dialog = await screen.findByRole('dialog', { name: 'New folder' });
    await user.type(within(dialog).getByLabelText('Folder name'), 'Tender');
    await user.click(within(dialog).getByRole('button', { name: 'Create folder' }));
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: /^Tender/i })).toBeInTheDocument();
    });

    // Create depth-2 subfolder "2026" inside "Tender"
    await user.click(within(nav).getByRole('button', { name: 'Manage folder Tender' }));
    await user.click(await screen.findByRole('menuitem', { name: 'New subfolder…' }));
    const subDialog = await screen.findByRole('dialog', { name: 'New folder in Tender' });
    await user.type(within(subDialog).getByLabelText('Folder name'), '2026');
    await user.click(within(subDialog).getByRole('button', { name: 'Create folder' }));
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: /^2026/i })).toBeInTheDocument();
    });

    // Create depth-3 subfolder "Q4" inside "2026"
    await user.click(within(nav).getByRole('button', { name: 'Manage folder 2026' }));
    await user.click(await screen.findByRole('menuitem', { name: 'New subfolder…' }));
    const sub3Dialog = await screen.findByRole('dialog', { name: 'New folder in 2026' });
    await user.type(within(sub3Dialog).getByLabelText('Folder name'), 'Q4');
    await user.click(within(sub3Dialog).getByRole('button', { name: 'Create folder' }));
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: /^Q4/i })).toBeInTheDocument();
    });

    // Depth-3 folder "Q4" should not offer "New subfolder…"
    await user.click(within(nav).getByRole('button', { name: 'Manage folder Q4' }));
    expect(screen.queryByRole('menuitem', { name: 'New subfolder…' })).not.toBeInTheDocument();

    // Rename "Q4" to "Q4 Final"
    await user.click(await screen.findByRole('menuitem', { name: 'Rename…' }));
    const renameDialog = await screen.findByRole('dialog', { name: 'Rename folder' });
    const renameInput = within(renameDialog).getByLabelText('Folder name');
    await user.clear(renameInput);
    await user.type(renameInput, 'Q4 Final');
    await user.click(within(renameDialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(within(nav).getByRole('button', { name: /^Q4 Final/i })).toBeInTheDocument();
    });

    // Delete "Q4 Final"
    await user.click(within(nav).getByRole('button', { name: 'Manage folder Q4 Final' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete…' }));
    const deleteDialog = await screen.findByRole('alertdialog');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete folder' }));
    await waitFor(() => {
      expect(within(nav).queryByRole('button', { name: /^Q4 Final/i })).not.toBeInTheDocument();
    });

    unmount();

    // Viewer mode: New folder button is disabled and row action menus are hidden
    const viewerWorkspace: WorkspaceSummary = { ...personal, myRole: 'viewer' };
    renderWithProviders(<Harness projectId={harbor.id} workspace={viewerWorkspace} />, {
      dataLayer,
    });
    const viewerNav = await screen.findByRole('navigation', { name: 'Folders' });
    expect(within(viewerNav).getByRole('button', { name: 'New folder' })).toBeDisabled();
    expect(
      within(viewerNav).queryByRole('button', { name: 'Manage folder Baselines' }),
    ).not.toBeInTheDocument();
  });
});
