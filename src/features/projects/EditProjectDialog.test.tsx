import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

function openEdit(code: string, dataLayer = createTestDataLayer()) {
  const project = dataLayer.store.read().projects.find((p) => p.code === code)!;
  const utils = renderWithProviders(
    <OpenDialog
      kind="editProject"
      options={{ workspaceId: project.workspaceId, projectId: project.id }}
    />,
    { dataLayer },
  );
  return { ...utils, project };
}

describe('EditProjectDialog', () => {
  it('opens on the project with every step reachable and saves the changes', async () => {
    const dataLayer = createTestDataLayer();
    const { user, project } = openEdit('002', dataLayer);
    const dialog = await screen.findByRole('dialog', { name: 'Edit project' });
    expect(dialog).toHaveAccessibleDescription('In My workspace');
    expect(await screen.findByLabelText('Project name')).toHaveValue('Metro Line Extension');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Location/ }));
    expect(await screen.findByText('Step 4 of 4: Location')).toBeInTheDocument();
    expect(screen.getByLabelText('City')).toHaveValue('Ankara');
    await user.click(screen.getByRole('button', { name: /Attributes/ }));
    await user.click(screen.getByLabelText('Stage'));
    await user.click(await screen.findByRole('option', { name: 'Construction' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Project updated')).toBeInTheDocument();
    expect(dataLayer.store.read().projects.find((p) => p.id === project.id)).toMatchObject({
      name: 'Metro Line Extension',
      attributes: { stage: 'construction' },
      location: { city: 'Ankara', latitude: 39.9334 },
    });
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });

  it("checks another project's ID but not the project's own", async () => {
    const isProjectCodeAvailable = vi.fn(async () => false);
    const { user } = openEdit(
      '002',
      createTestDataLayer({ overrides: { isProjectCodeAvailable } }),
    );
    const code = await screen.findByLabelText('Project ID');
    await user.clear(code);
    await user.type(code, ' 002 ');
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(isProjectCodeAvailable).not.toHaveBeenCalled();
    await user.clear(code);
    await user.type(code, '001');
    expect(
      await screen.findByText('This ID is already used in this workspace'),
    ).toBeInTheDocument();
  });

  it('removes the current photo', async () => {
    const dataLayer = createTestDataLayer();
    dataLayer.store.write((db) => {
      db.projects.find((p) => p.code === '002')!.coverImageUrl =
        'data:image/png;base64,iVBORw0KGgo=';
    });
    const { user, project } = openEdit('002', dataLayer);
    await user.click(await screen.findByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Project updated')).toBeInTheDocument();
    expect(
      dataLayer.store.read().projects.find((p) => p.id === project.id)!.coverImageUrl,
    ).toBeNull();
  });

  it('keeps the status date with the current schedule (R6)', async () => {
    const dataLayer = createTestDataLayer();
    const update = vi.spyOn(dataLayer.repository, 'updateProject');
    const { user } = openEdit('003', dataLayer);
    await user.click(await screen.findByRole('button', { name: /Attributes/ }));
    expect(screen.getByLabelText('Status date')).toBeDisabled();
    expect(screen.getByText('Follows the current schedule (Update 2)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Project updated')).toBeInTheDocument();
    expect(update.mock.calls[0]![0]).not.toHaveProperty('statusDate');
  });

  it('shows viewers the project details, read only', async () => {
    const { user } = openEdit('T-01', createTestDataLayer({ teamRole: 'viewer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Project details' });
    expect(await within(dialog).findByLabelText('Project name')).toHaveAttribute('readonly');
    expect(within(dialog).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Location/ }));
    expect(within(dialog).getByLabelText('Latitude')).toHaveValue('41.0422');
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1)!);
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });

  it('lets viewers change and save nothing, and closes from the footer', async () => {
    const dataLayer = createTestDataLayer({ teamRole: 'viewer' });
    dataLayer.store.write((db) => {
      db.projects.find((p) => p.code === 'T-01')!.coverImageUrl =
        'data:image/png;base64,iVBORw0KGgo=';
    });
    const update = vi.spyOn(dataLayer.repository, 'updateProject');
    const { user } = openEdit('T-01', dataLayer);
    const dialog = await screen.findByRole('dialog', { name: 'Project details' });
    expect(within(dialog).getByRole('img', { name: 'Project photo' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    const name = within(dialog).getByLabelText('Project name');
    await user.type(name, 'x{Enter}');
    expect(name).toHaveValue('Tunnel Ventilation Upgrade');
    await user.click(within(dialog).getByRole('button', { name: /Attributes/ }));
    for (const label of ['Status', 'Stage', 'Project type', 'Sector']) {
      expect(within(dialog).getByRole('combobox', { name: label })).toBeDisabled();
    }
    // The header's X is named "Close" too; the footer's button shows the word.
    await user.click(within(dialog).getByText('Close', { selector: 'button' }));
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
    expect(update).not.toHaveBeenCalled();
  });

  it("focuses a viewer's first field that can take focus on each step", async () => {
    const { user } = openEdit('T-01', createTestDataLayer({ teamRole: 'viewer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Project details' });
    await waitFor(() => expect(within(dialog).getByLabelText('Project name')).toHaveFocus());
    within(dialog).getByRole('button', { name: 'Attributes, completed' }).focus();
    await user.keyboard('{Enter}');
    // The selects are disabled, and so is the status date that follows the current schedule.
    await waitFor(() => expect(within(dialog).getByLabelText('Start date')).toHaveFocus());
  });

  it('describes the current photo and its Remove button', async () => {
    const dataLayer = createTestDataLayer();
    dataLayer.store.write((db) => {
      db.projects.find((p) => p.code === '002')!.coverImageUrl =
        'data:image/png;base64,iVBORw0KGgo=';
    });
    openEdit('002', dataLayer);
    expect(await screen.findByRole('img', { name: 'Project photo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveAccessibleDescription(
      'Project photo',
    );
  });

  it('saves with Enter in a field', async () => {
    const dataLayer = createTestDataLayer();
    const { user, project } = openEdit('002', dataLayer);
    const name = await screen.findByLabelText('Project name');
    await user.clear(name);
    await user.type(name, 'Metro Line Extension B{Enter}');
    expect(await screen.findByText('Project updated')).toBeInTheDocument();
    expect(dataLayer.store.read().projects.find((p) => p.id === project.id)!.name).toBe(
      'Metro Line Extension B',
    );
  });

  it('drops the second click of a double click on Next', async () => {
    const { user } = openEdit('002');
    await user.click(await screen.findByRole('button', { name: /Client/ }));
    expect(await screen.findByText('Step 3 of 4: Client')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }), { detail: 1 });
    expect(await screen.findByText('Step 4 of 4: Location')).toBeInTheDocument();
    // "Back" has taken the place of "Next", so the second click lands on it.
    fireEvent.click(screen.getByRole('button', { name: 'Back' }), { detail: 2 });
    expect(screen.getByText('Step 4 of 4: Location')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Step 3 of 4: Client')).toBeInTheDocument();
  });

  it('returns to Details with focus on the Project ID after a conflict', async () => {
    const { user } = openEdit(
      '002',
      createTestDataLayer({ overrides: { isProjectCodeAvailable: async () => true } }),
    );
    const code = await screen.findByLabelText('Project ID');
    await user.clear(code);
    await user.type(code, '001');
    await user.click(screen.getByRole('button', { name: /Location/ }));
    expect(await screen.findByText('Step 4 of 4: Location')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Project ID')).toHaveFocus());
    expect(screen.getByText('This ID is already used in this workspace')).toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('editProject');
  });

  it('shows a skeleton only while the project takes a while to load', async () => {
    const dataLayer = createTestDataLayer();
    const read = dataLayer.repository.getProject.bind(dataLayer.repository);
    let release = (): void => {};
    const loaded = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(dataLayer.repository, 'getProject').mockImplementation(async (projectId) => {
      await loaded;
      return read(projectId);
    });
    openEdit('002', dataLayer);
    expect(screen.queryByTestId('edit-project-skeleton')).not.toBeInTheDocument();
    expect(await screen.findByTestId('edit-project-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();
    act(() => release());
    expect(await screen.findByLabelText('Project name')).toHaveValue('Metro Line Extension');
    expect(screen.queryByTestId('edit-project-skeleton')).not.toBeInTheDocument();
  });

  it('shows a failed read with Retry', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'getProject').mockRejectedValueOnce(
      new RepositoryError('network', 'Network down'),
    );
    const { user } = openEdit('002', dataLayer);
    const dialog = await screen.findByRole('dialog', { name: 'Edit project' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Project name')).toHaveValue('Metro Line Extension');
  });

  it.each([
    ['a project of another workspace', 'elsewhere'],
    ["a workspace that isn't mine", 'missing'],
  ] as const)('shows %s as a failed read', async (_case, kind) => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const mine = db.projects.find((p) => p.code === '002')!;
    const team = db.projects.find((p) => p.code === 'T-01')!;
    const options =
      kind === 'elsewhere'
        ? { workspaceId: mine.workspaceId, projectId: team.id }
        : { workspaceId: 'not-a-workspace', projectId: mine.id };
    renderWithProviders(<OpenDialog kind="editProject" options={options} />, { dataLayer });
    const dialog = await screen.findByRole('dialog', { name: 'Edit project' });
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(within(dialog).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Project name')).not.toBeInTheDocument();
  });
});
