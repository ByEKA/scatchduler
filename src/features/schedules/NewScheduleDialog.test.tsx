import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Schedule } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function open(dataLayer = createTestDataLayer()) {
  const utils = renderWithProviders(<OpenDialog kind="newSchedule" />, {
    route: '/home',
    path: '/home',
    dataLayer,
  });
  await waitFor(() =>
    expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
  );
  return utils;
}

describe('NewScheduleDialog', () => {
  it('creates a schedule for the current project and opens it', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const riverside = db.projects.find((p) => p.code === '001')!;
    const { user } = await open(dataLayer);
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('New schedule');
    await user.clear(name);
    await user.type(name, 'Look-ahead W43');
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText('Schedule created')).toBeInTheDocument();
    const created = dataLayer.store.read().schedules.find((s) => s.name === 'Look-ahead W43')!;
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/w/${personal.id}/p/${riverside.id}/schedule?scheduleId=${created.id}`,
    );
    expect(screen.queryByRole('dialog', { name: 'New schedule' })).not.toBeInTheDocument();
  });

  it('submits once when the button is clicked twice', async () => {
    const dataLayer = createTestDataLayer();
    await open(dataLayer);
    const button = screen.getByRole('button', { name: 'Create schedule' });
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText('Schedule created');
    expect(dataLayer.store.read().schedules.filter((s) => s.name === 'New schedule')).toHaveLength(
      1,
    );
  });

  it('keeps the form open with its values when saving fails', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        createSchedule: () => Promise.reject(new RepositoryError('network', 'offline')),
      },
    });
    const { user } = await open(dataLayer);
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('New schedule');
  });

  it('asks for a project first in an empty workspace', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newSchedule" />, {
      route: '/home',
      path: '/home',
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    expect(await screen.findByText('Create a project first.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it('opens with Name focused and its default text selected', async () => {
    // Opened once the projects are there, the way a button in the app opens it.
    function OpenWhenReady() {
      return useCurrentContext().status === 'ready' ? <OpenDialog kind="newSchedule" /> : null;
    }
    renderWithProviders(<OpenWhenReady />, { route: '/home', path: '/home' });
    const name = await screen.findByLabelText('Name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveProperty('selectionStart', 0);
    expect(name).toHaveProperty('selectionEnd', 'New schedule'.length);
  });

  it('stays one dialog while the projects load, then focuses Name', async () => {
    const dataLayer = createTestDataLayer();
    const listProjects = dataLayer.repository.listProjects.bind(dataLayer.repository);
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    dataLayer.repository.listProjects = async (workspaceId) => {
      await released;
      return listProjects(workspaceId);
    };
    const { user } = renderWithProviders(<OpenDialog kind="newSchedule" />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    const dialog = await screen.findByRole('dialog', { name: 'New schedule' });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    await act(async () => release());
    const name = await screen.findByLabelText('Name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(name).toHaveProperty('selectionEnd', 'New schedule'.length);
    expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower');
    // The same element: the dialog did not unmount and play its open animation again.
    expect(screen.getByRole('dialog', { name: 'New schedule' })).toBe(dialog);
    // The project that arrived late is a default, so the form is still pristine.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('none');
  });

  it('starts on the project the dialog was opened for', async () => {
    const dataLayer = createTestDataLayer();
    const harbor = dataLayer.store.read().projects.find((p) => p.code === '003')!;
    renderWithProviders(<OpenDialog kind="newSchedule" options={{ projectId: harbor.id }} />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Harbor Logistics Hub'),
    );
  });

  it('starts on the current project of the page', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    renderWithProviders(<OpenDialog kind="newSchedule" />, {
      route: `/w/${personal.id}/p/${harbor.id}/files`,
      path: '/w/:workspaceId/p/:projectId/files',
      dataLayer,
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Harbor Logistics Hub'),
    );
  });

  it('finds a project by search and creates the schedule there', async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const personal = db.workspaces[0]!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    const { user } = await open(dataLayer);
    const trigger = screen.getByRole('combobox', { name: 'Project' });
    await user.click(trigger);
    // The search matches codes as well as names.
    await user.keyboard('003');
    const option = screen.getByRole('option');
    expect(within(option).getByText('003')).toBeInTheDocument();
    expect(within(option).getByText('Harbor Logistics Hub')).toBeInTheDocument();
    // The picker lists the current workspace only, so options carry no workspace name (D11).
    expect(within(option).queryByText('My workspace')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveTextContent('Harbor Logistics Hub');
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText('Schedule created')).toBeInTheDocument();
    const created = dataLayer.store.read().schedules.find((s) => s.name === 'New schedule')!;
    expect(created.projectId).toBe(harbor.id);
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/w/${personal.id}/p/${harbor.id}/schedule?scheduleId=${created.id}`,
    );
  });

  it('locks the project field while saving', async () => {
    let fail: () => void = () => {};
    const dataLayer = createTestDataLayer({
      overrides: {
        createSchedule: () =>
          new Promise<Schedule>((_resolve, reject) => {
            fail = () => reject(new RepositoryError('network', 'offline'));
          }),
      },
    });
    const { user } = await open(dataLayer);
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByLabelText('Project')).toBeDisabled();
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    const link = screen.getByRole('button', { name: 'Create a new project' });
    expect(link).toBeDisabled();
    fireEvent.click(link);
    expect(screen.getByTestId('dialog')).toHaveTextContent('newSchedule');
    await act(async () => fail());
    expect(
      await screen.findByText("Can't reach the server. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toBeEnabled();
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('button', { name: 'Create a new project' })).toBeEnabled();
  });

  it('replaces a pristine form with the new project dialog at once', async () => {
    const { user } = await open();
    await user.click(screen.getByRole('button', { name: 'Create a new project' }));
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it('asks before a changed form gives way to the new project dialog', async () => {
    const { user } = await open();
    const name = screen.getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Look-ahead W43');
    const link = screen.getByRole('button', { name: 'Create a new project' });
    await user.click(link);
    expect(
      await screen.findByRole('alertdialog', { name: 'Discard changes?' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('newSchedule');
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(link).toHaveFocus());
    expect(screen.getByLabelText('Name')).toHaveValue('Look-ahead W43');
    expect(screen.getByTestId('dialog')).toHaveTextContent('newSchedule');
    await user.click(link);
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it("moves to the new workspace's default project when the workspace changes", async () => {
    const dataLayer = createTestDataLayer();
    const db = dataLayer.store.read();
    const team = db.workspaces[1]!;
    const teamProject = db.projects.find((p) => p.workspaceId === team.id)!;
    let navigate!: NavigateFunction;
    function GrabNavigate() {
      navigate = useNavigate();
      return null;
    }
    const { user } = renderWithProviders(
      <>
        <GrabNavigate />
        <OpenDialog kind="newSchedule" />
      </>,
      { route: '/home', dataLayer },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
    );
    // Browser Back or Forward can change the page while the dialog is open.
    await act(() => navigate(`/w/${team.id}/projects`));
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent(teamProject.name),
    );
    await user.click(screen.getByRole('button', { name: 'Create schedule' }));
    expect(await screen.findByText('Schedule created')).toBeInTheDocument();
    const created = dataLayer.store.read().schedules.find((s) => s.name === 'New schedule')!;
    expect(created.projectId).toBe(teamProject.id);
  });

  it('opens without fetching the workspace and project lists again', async () => {
    const dataLayer = createTestDataLayer();
    const listWorkspaces = vi.spyOn(dataLayer.repository, 'listWorkspaces');
    const listProjects = vi.spyOn(dataLayer.repository, 'listProjects');
    function Opener() {
      const { openDialog } = useDialogs();
      const { status } = useCurrentContext();
      return (
        <button disabled={status !== 'ready'} onClick={() => openDialog('newSchedule')}>
          open
        </button>
      );
    }
    const { user, queryClient } = renderWithProviders(<Opener />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'open' })).toBeEnabled());
    // Stale lists: any observer that mounts with the dialog would fetch them again.
    await act(() => queryClient.invalidateQueries({ refetchType: 'none' }));
    const calls = [listWorkspaces.mock.calls.length, listProjects.mock.calls.length];
    await user.click(screen.getByRole('button', { name: 'open' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Project')).toHaveTextContent('Riverside Office Tower'),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect([listWorkspaces.mock.calls.length, listProjects.mock.calls.length]).toEqual(calls);
  });
});
