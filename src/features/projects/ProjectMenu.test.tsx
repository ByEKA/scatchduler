import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Role } from '@/data/types';
import { ProjectMenu } from '@/features/projects/ProjectMenu';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function renderMenu(code = '003', teamRole?: Role, route = '/') {
  const dataLayer = createTestDataLayer({ teamRole });
  const workspaceId = dataLayer.store.read().projects.find((p) => p.code === code)!.workspaceId;
  const project = (await dataLayer.repository.listProjects(workspaceId)).find(
    (p) => p.code === code,
  )!;
  const workspace = (await dataLayer.repository.listWorkspaces()).find(
    (w) => w.id === workspaceId,
  )!;
  const utils = renderWithProviders(<ProjectMenu project={project} workspace={workspace} />, {
    dataLayer,
    route: route.replace(':p', project.id).replace(':w', workspaceId),
  });
  return { ...utils, project };
}
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('ProjectMenu', () => {
  it('offers each role the actions it can take', async () => {
    const owner = await renderMenu();
    await owner.user.click(
      screen.getByRole('button', { name: 'Actions for Harbor Logistics Hub' }),
    );
    expect(items()).toEqual(['Open', 'Edit project', 'Delete project']);
    owner.unmount();
    const editor = await renderMenu('T-01', 'editor');
    await editor.user.click(
      screen.getByRole('button', { name: 'Actions for Tunnel Ventilation Upgrade' }),
    );
    expect(items()).toEqual(['Open', 'Edit project']);
    editor.unmount();
    const viewer = await renderMenu('T-01', 'viewer');
    await viewer.user.click(
      screen.getByRole('button', { name: 'Actions for Tunnel Ventilation Upgrade' }),
    );
    expect(items()).toEqual(['Open', 'Project details']);
  });

  it('opens the project and its edit dialog', async () => {
    const { user, project } = await renderMenu();
    await user.click(screen.getByRole('button', { name: 'Actions for Harbor Logistics Hub' }));
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveAttribute(
      'href',
      `/w/${project.workspaceId}/p/${project.id}/files`,
    );
    await user.click(screen.getByRole('menuitem', { name: 'Edit project' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('editProject');
  });

  it('deletes the project once its ID is typed, with one request for two quick clicks, and leaves its pages', async () => {
    const { user, dataLayer, project } = await renderMenu('003', undefined, '/w/:w/p/:p/files');
    const deleteProject = vi.spyOn(dataLayer.repository, 'deleteProject');
    await user.click(screen.getByRole('button', { name: 'Actions for Harbor Logistics Hub' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Harbor Logistics Hub?' });
    expect(dialog).toHaveAccessibleDescription(
      "This deletes its 3 schedules and their stored files. It can't be undone.",
    );
    expect(within(dialog).getByText('Type the project ID to confirm')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Delete project' });
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    await user.click(confirm);
    expect(deleteProject).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Project ID'), ' 003 ');
    expect(confirm).not.toHaveAttribute('aria-disabled', 'true');
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(await screen.findByText('Project deleted')).toBeInTheDocument();
    expect(deleteProject).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${project.workspaceId}/projects`);
  });

  it('gives focus back to its button when a dialog it opened closes, and leaves the page usable', async () => {
    const { user } = await renderMenu();
    const trigger = screen.getByRole('button', { name: 'Actions for Harbor Logistics Hub' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Harbor Logistics Hub?' });
    expect(within(dialog).getByLabelText('Project ID')).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.pointerEvents).toBe('');
    // The keyboard way: Enter opens the menu on "Open", ArrowDown moves to "Edit project".
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Open' })).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('editProject'));
    expect(await screen.findByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.pointerEvents).toBe('');
  });

  it('names what goes with a project that has no schedules', async () => {
    const { user } = await renderMenu('002');
    await user.click(screen.getByRole('button', { name: 'Actions for Metro Line Extension' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Delete Metro Line Extension?' }),
    ).toHaveAccessibleDescription("This deletes the project. It can't be undone.");
  });

  it('keeps a failed delete in the dialog with its error, and sends the next try', async () => {
    const { user, dataLayer } = await renderMenu();
    const deleteProject = vi
      .spyOn(dataLayer.repository, 'deleteProject')
      .mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    await user.click(screen.getByRole('button', { name: 'Actions for Harbor Logistics Hub' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete project' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Harbor Logistics Hub?' });
    await user.type(within(dialog).getByLabelText('Project ID'), '003');
    const confirm = within(dialog).getByRole('button', { name: 'Delete project' });
    await user.click(confirm);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    expect(screen.getByRole('alertdialog', { name: 'Delete Harbor Logistics Hub?' })).toBe(dialog);
    expect(screen.queryByText('Project deleted')).not.toBeInTheDocument();
    await user.click(confirm);
    expect(await screen.findByText('Project deleted')).toBeInTheDocument();
    expect(deleteProject).toHaveBeenCalledTimes(2);
  });
});
