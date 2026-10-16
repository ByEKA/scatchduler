import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useNavigate } from 'react-router';
import type { NavigateFunction } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Project } from '@/data/types';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function openWizard(dataLayer = createTestDataLayer()) {
  const utils = renderWithProviders(<OpenDialog kind="newProject" />, {
    route: '/home',
    path: '/home',
    dataLayer,
  });
  await screen.findByRole('dialog', { name: 'New project' });
  return utils;
}

async function fillDetailsAndGoToLastStep(
  user: Awaited<ReturnType<typeof openWizard>>['user'],
  code = '007',
) {
  await user.type(screen.getByLabelText('Project name'), '  Pier 9  ');
  await user.type(screen.getByLabelText('Project ID'), code);
  for (const step of ['Attributes', 'Client', 'Location']) {
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText(new RegExp(`Step \\d of 4: ${step}`))).toBeInTheDocument();
  }
}

type User = Awaited<ReturnType<typeof openWizard>>['user'];

const TAKEN = 'This ID is already used in this workspace';
const OFFLINE = "Can't reach the server. Check your connection and try again.";

/** Gives a click's async validation and step change time to show. */
function settle() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 50)));
}

async function fillDetails(user: User, code = '007') {
  await user.type(screen.getByLabelText('Project name'), 'Pier 9');
  await user.type(screen.getByLabelText('Project ID'), code);
}

async function next(user: User, step: string) {
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText(step)).toBeInTheDocument();
}

describe('NewProjectWizard', () => {
  it('validates step 1 before moving on', async () => {
    const { user } = await openWizard();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Enter a project name')).toBeInTheDocument();
    expect(screen.getByText('Enter a project ID')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
  });

  it('flags an ID that is already used', async () => {
    const { user } = await openWizard();
    await user.type(screen.getByLabelText('Project ID'), '001');
    expect(
      await screen.findByText('This ID is already used in this workspace'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('keeps values when going back and creates the project', async () => {
    const dataLayer = createTestDataLayer();
    const personal = dataLayer.store.read().workspaces[0]!;
    const { user } = await openWizard(dataLayer);
    await user.type(screen.getByLabelText('Project name'), '  Pier 9  ');
    await user.type(screen.getByLabelText('Project ID'), '007');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Step 2 of 4: Attributes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Project name')).toHaveValue('  Pier 9  ');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await user.type(await screen.findByLabelText('Client name'), 'Port Authority');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Project created')).toBeInTheDocument();
    const created = dataLayer.store.read().projects.find((p) => p.code === '007')!;
    expect(created).toMatchObject({
      name: 'Pier 9',
      client: { name: 'Port Authority', contactName: null, contactEmail: null },
    });
    expect(localStorage.getItem(`ui.lastProjectId.${personal.id}`)).toBe(created.id);
  });

  it('creates a single project on a double click', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user);
    const create = screen.getByRole('button', { name: 'Create project' });
    fireEvent.click(create);
    fireEvent.click(create);
    await screen.findByText('Project created');
    expect(dataLayer.store.read().projects.filter((p) => p.code === '007')).toHaveLength(1);
  });

  it('returns to step 1 when the ID is taken at submit time', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        isProjectCodeAvailable: async () => true,
        createProject: () =>
          Promise.reject(
            new RepositoryError('conflict', 'This ID is already used in this workspace'),
          ),
      },
    });
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user, '001');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.getByText('This ID is already used in this workspace')).toBeInTheDocument();
  });

  it('moves one step on a double click on Next', async () => {
    const { user } = await openWizard();
    await fillDetails(user);
    // A double click is two clicks; the second carries detail 2.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }), { detail: 1 });
    expect(await screen.findByText('Step 2 of 4: Attributes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }), { detail: 2 });
    await settle();
    expect(screen.getByText('Step 2 of 4: Attributes')).toBeInTheDocument();
  });

  it('does not create the project when a double click on Next reaches step 4', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const { user } = await openWizard(dataLayer);
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    await next(user, 'Step 3 of 4: Client');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }), { detail: 1 });
    expect(await screen.findByText('Step 4 of 4: Location')).toBeInTheDocument();
    // The second click lands on "Create project", which took the place of "Next".
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }), { detail: 2 });
    await settle();
    expect(createProject).not.toHaveBeenCalled();
    expect(screen.getByText('Step 4 of 4: Location')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Project created')).toBeInTheDocument();
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it('sends one request for two submits that arrive before the pending state renders', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user);
    const create = screen.getByRole('button', { name: 'Create project' });
    // Both clicks run before React renders, so the button is still enabled for the second.
    await act(async () => {
      create.click();
      create.click();
    });
    await screen.findByText('Project created');
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it('returns to step 1 without a request when the ID turns out taken after step 1 (D12)', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const isProjectCodeAvailable = dataLayer.repository.isProjectCodeAvailable.bind(
      dataLayer.repository,
    );
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const checked: string[] = [];
    dataLayer.repository.isProjectCodeAvailable = async (workspaceId, code) => {
      await answered;
      const available = await isProjectCodeAvailable(workspaceId, code);
      checked.push(code);
      return available;
    };
    const { user } = await openWizard(dataLayer);
    await fillDetails(user, '001');
    // The check has not answered yet, so "Next" lets the user on.
    await next(user, 'Step 2 of 4: Attributes');
    await act(async () => answer());
    await waitFor(() => expect(checked).toContain('001'));
    await next(user, 'Step 3 of 4: Client');
    await next(user, 'Step 4 of 4: Location');
    const create = screen.getByRole('button', { name: 'Create project' });
    expect(create).toBeEnabled();
    await user.click(create);
    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.getByText(TAKEN)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Project ID')).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(createProject).not.toHaveBeenCalled();
  });

  it('shows a hint and lets the user go on when the ID check fails', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        isProjectCodeAvailable: () => Promise.reject(new RepositoryError('network', 'offline')),
      },
    });
    const { user } = await openWizard(dataLayer);
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    const status = within(dialog).getByRole('status');
    await fillDetails(user);
    // The status region was there before the hint, so screen readers announce the hint.
    await waitFor(() => expect(status).toHaveTextContent("Couldn't check this ID right now"));
    expect(screen.getByLabelText('Project ID')).toHaveAccessibleDescription(
      "Couldn't check this ID right now",
    );
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    await next(user, 'Step 2 of 4: Attributes');
  });

  it('announces a taken ID through the status region', async () => {
    const { user } = await openWizard();
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    const status = within(dialog).getByRole('status');
    expect(status).toBeEmptyDOMElement();
    await user.type(screen.getByLabelText('Project ID'), '001');
    await waitFor(() => expect(status).toHaveTextContent(TAKEN));
    expect(screen.getByLabelText('Project ID')).toHaveAccessibleDescription(TAKEN);
  });

  it('focuses the first invalid field after a failed Next and clears its error once fixed', async () => {
    const { user } = await openWizard();
    await user.type(screen.getByLabelText('Project name'), 'Pier 9');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Enter a project ID')).toBeInTheDocument();
    const code = screen.getByLabelText('Project ID');
    await waitFor(() => expect(code).toHaveFocus());
    await user.type(code, '007');
    await waitFor(() => expect(screen.queryByText('Enter a project ID')).not.toBeInTheDocument());
    expect(code).not.toHaveAttribute('aria-invalid');
  });

  it('focuses the first field of the step on open, after Next and after Back', async () => {
    const { user } = await openWizard();
    await waitFor(() => expect(screen.getByLabelText('Project name')).toHaveFocus());
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    await waitFor(() => expect(screen.getByLabelText('Project type')).toHaveFocus());
    await next(user, 'Step 3 of 4: Client');
    await waitFor(() => expect(screen.getByLabelText('Client name')).toHaveFocus());
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByLabelText('Project type')).toHaveFocus(), {
      timeout: 3000,
    });
  });

  it('opens completed steps from the stepper and checks the step on screen to go forward', async () => {
    const { user } = await openWizard();
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    await next(user, 'Step 3 of 4: Client');
    expect(screen.getByRole('button', { name: 'Details, completed' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Attributes, completed' })).toBeEnabled();
    // The current step and the upcoming one are not buttons.
    expect(screen.queryByRole('button', { name: /^Client/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Location/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Details, completed' }));
    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    const name = screen.getByLabelText('Project name');
    await waitFor(() => expect(name).toHaveFocus());
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Attributes, completed' }));
    await waitFor(() => expect(name).toHaveFocus());
    expect(screen.getByText('Enter a project name')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
  });

  it('opens the step of the first invalid field when Create project fails validation', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user);
    // Back on step 2 through the stepper, the dates go out of order...
    await user.click(screen.getByRole('button', { name: 'Attributes, completed' }));
    fireEvent.change(await screen.findByLabelText('Start date'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('Planned finish date'), {
      target: { value: '2026-10-01' },
    });
    // ...and a jump from step 1 to step 3 checks step 1 only.
    await user.click(screen.getByRole('button', { name: 'Details, completed' }));
    await user.click(await screen.findByRole('button', { name: 'Client, completed' }));
    await next(user, 'Step 4 of 4: Location');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Step 2 of 4: Attributes')).toBeInTheDocument();
    expect(screen.getByText('Finish must be on or after the start date')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Planned finish date')).toHaveFocus());
    expect(createProject).not.toHaveBeenCalled();
  });

  it('locks the fields, Back, Cancel and the stepper while creating', async () => {
    let fail: () => void = () => {};
    const dataLayer = createTestDataLayer({
      overrides: {
        createProject: () =>
          new Promise<Project>((_resolve, reject) => {
            fail = () => reject(new RepositoryError('network', 'offline'));
          }),
      },
    });
    const { user } = await openWizard(dataLayer);
    await fillDetailsAndGoToLastStep(user);
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    for (const label of ['Address', 'City', 'Country']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('readonly');
    }
    for (const name of [
      'Back',
      'Cancel',
      'Close',
      'Details, completed',
      'Attributes, completed',
      'Client, completed',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await act(async () => fail());
    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Address')).not.toHaveAttribute('readonly'));
    for (const name of ['Back', 'Cancel', 'Details, completed', 'Create project']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
  });

  it('checks the ID against, and creates in, the workspace the page changed to', async () => {
    const dataLayer = createTestDataLayer();
    const team = dataLayer.store.read().workspaces[1]!;
    const isProjectCodeAvailable = vi.spyOn(dataLayer.repository, 'isProjectCodeAvailable');
    let navigate!: NavigateFunction;
    function GrabNavigate() {
      navigate = useNavigate();
      return null;
    }
    const { user } = renderWithProviders(
      <>
        <GrabNavigate />
        <OpenDialog kind="newProject" />
      </>,
      { route: '/home', dataLayer },
    );
    await screen.findByRole('dialog', { name: 'New project' });
    // T-01 is free in the personal workspace and used in the team one.
    await fillDetails(user, 'T-01');
    await waitFor(() => expect(isProjectCodeAvailable).toHaveResolvedWith(true));
    expect(screen.queryByText(TAKEN)).not.toBeInTheDocument();
    // Browser Back or Forward can change the page while the dialog is open.
    await act(() => navigate(`/w/${team.id}/projects`));
    expect(await screen.findByText(TAKEN)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    const code = screen.getByLabelText('Project ID');
    await user.clear(code);
    // 001 is used in the personal workspace only.
    await user.type(code, '001');
    await waitFor(() => expect(isProjectCodeAvailable).toHaveBeenLastCalledWith(team.id, '001'));
    await next(user, 'Step 2 of 4: Attributes');
    await next(user, 'Step 3 of 4: Client');
    await next(user, 'Step 4 of 4: Location');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Project created')).toBeInTheDocument();
    const created = dataLayer.store.read().projects.find((p) => p.name === 'Pier 9')!;
    expect(created).toMatchObject({ code: '001', workspaceId: team.id });
  });

  it('shows the workspace error with Retry, then the fields with Project name focused', async () => {
    const dataLayer = createTestDataLayer();
    const listWorkspaces = dataLayer.repository.listWorkspaces.bind(dataLayer.repository);
    let offline = true;
    dataLayer.repository.listWorkspaces = () =>
      offline ? Promise.reject(new RepositoryError('network', 'offline')) : listWorkspaces();
    const { user } = renderWithProviders(<OpenDialog kind="newProject" />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    expect(await within(dialog).findByText(OFFLINE)).toBeInTheDocument();
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    offline = false;
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    const name = await screen.findByLabelText('Project name');
    await waitFor(() => expect(name).toHaveFocus());
    expect(within(dialog).queryByText(OFFLINE)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('reports a partly typed date as invalid', async () => {
    const { user } = await openWizard();
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    const start = screen.getByLabelText('Start date');
    // A partial entry such as 10/dd/2026: the browser reports the value '' with badInput set.
    Object.defineProperty(start, 'validity', {
      configurable: true,
      value: { badInput: true, valid: false },
    });
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Enter a valid date')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 4: Attributes')).toBeInTheDocument();
    await waitFor(() => expect(start).toHaveFocus());
    // Clearing the partial entry changes no value either: the error goes when the field loses
    // focus, and Next moves on.
    Reflect.deleteProperty(start, 'validity');
    await user.tab();
    await waitFor(() => expect(screen.queryByText('Enter a valid date')).not.toBeInTheDocument());
    await next(user, 'Step 3 of 4: Client');
  });

  it('previews the chosen photo, but not one over 5 MB', async () => {
    const { user } = await openWizard();
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    const input = screen.getByLabelText('Project photo', { selector: 'input' });
    await user.upload(input, new File(['x'], 'site.png', { type: 'image/png' }));
    expect(within(dialog).getByRole('presentation')).toHaveAttribute(
      'src',
      expect.stringMatching(/^blob:/),
    );
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });
    await user.upload(input, big);
    expect(within(dialog).getByText('big.png')).toBeInTheDocument();
    expect(within(dialog).queryByRole('presentation')).not.toBeInTheDocument();
  });

  it('lets Project type go back to None', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const { user } = await openWizard(dataLayer);
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    const type = screen.getByLabelText('Project type');
    expect(type).toHaveTextContent('None');
    await user.click(type);
    await user.click(await screen.findByRole('option', { name: 'Building' }));
    expect(type).toHaveTextContent('Building');
    await user.click(type);
    await user.click(await screen.findByRole('option', { name: 'None' }));
    expect(type).toHaveTextContent('None');
    await next(user, 'Step 3 of 4: Client');
    await next(user, 'Step 4 of 4: Location');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(createProject).toHaveBeenCalledTimes(1));
    expect(createProject.mock.calls[0]![0]).toMatchObject({ attributes: { projectType: null } });
  });

  it('names completed steps as completed for screen readers', async () => {
    const { user } = await openWizard();
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    expect(screen.getByRole('button', { name: 'Details, completed' })).toBeInTheDocument();
    expect(screen.getByText('Attributes').closest('[aria-current="step"]')).not.toBeNull();
  });

  it('drops the partial date error with the date input that had the partial entry', async () => {
    const { user } = await openWizard();
    await fillDetails(user);
    await next(user, 'Step 2 of 4: Attributes');
    await next(user, 'Step 3 of 4: Client');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    const start = await screen.findByLabelText('Start date');
    Object.defineProperty(start, 'validity', {
      configurable: true,
      value: { badInput: true, valid: false },
    });
    // Step 2 has passed Next, so the date is checked again when it loses focus.
    await user.click(start);
    await user.tab();
    expect(await screen.findByText('Enter a valid date')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await next(user, 'Step 2 of 4: Attributes');
    // A new, empty Start date is on screen.
    expect(screen.getByLabelText('Start date')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Enter a valid date')).not.toBeInTheDocument();
  });

  it('acts once on a held Enter, and a single Enter on step 4 creates the project', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const { user } = await openWizard(dataLayer);
    await fillDetails(user);
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Step 2 of 4: Attributes')).toBeInTheDocument();
    await next(user, 'Step 3 of 4: Client');
    await waitFor(() => expect(screen.getByLabelText('Client name')).toHaveFocus());
    // A held key repeats its keydown, with `repeat` set on all but the first.
    await user.keyboard('{Enter>8}');
    await settle();
    expect(createProject).not.toHaveBeenCalled();
    expect(await screen.findByText('Step 4 of 4: Location')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Address')).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(await screen.findByText('Project created')).toBeInTheDocument();
    expect(createProject).toHaveBeenCalledTimes(1);
  });

  it('keeps Project ID schema errors out of the status region', async () => {
    const { user } = await openWizard();
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    const status = within(dialog).getByRole('status');
    await user.type(screen.getByLabelText('Project name'), 'Pier 9');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Enter a project ID')).toBeInTheDocument();
    // Focus on the field reads the error through aria-describedby; the region would repeat it.
    expect(status).toBeEmptyDOMElement();
    expect(screen.getByLabelText('Project ID')).toHaveAccessibleDescription('Enter a project ID');
    expect(screen.getByLabelText('Project ID')).toHaveAttribute('aria-invalid', 'true');
  });

  it('opens step 1 for a known-taken ID before a later step with an error (D12)', async () => {
    const dataLayer = createTestDataLayer();
    const createProject = vi.spyOn(dataLayer.repository, 'createProject');
    const isProjectCodeAvailable = dataLayer.repository.isProjectCodeAvailable.bind(
      dataLayer.repository,
    );
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const checked: string[] = [];
    dataLayer.repository.isProjectCodeAvailable = async (workspaceId, code) => {
      await answered;
      const available = await isProjectCodeAvailable(workspaceId, code);
      checked.push(code);
      return available;
    };
    const { user } = await openWizard(dataLayer);
    // The check has not answered yet, so every step lets the user on.
    await fillDetailsAndGoToLastStep(user, '001');
    await user.click(screen.getByRole('button', { name: 'Attributes, completed' }));
    fireEvent.change(await screen.findByLabelText('Start date'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('Planned finish date'), {
      target: { value: '2026-10-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Details, completed' }));
    await user.click(await screen.findByRole('button', { name: 'Client, completed' }));
    await next(user, 'Step 4 of 4: Location');
    await act(async () => answer());
    await waitFor(() => expect(checked).toContain('001'));
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.getByText(TAKEN)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Project ID')).toHaveFocus());
    expect(createProject).not.toHaveBeenCalled();
  });

  it('hides the check mark beside a Project ID with an error', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        isProjectCodeAvailable: async () => true,
        createProject: () =>
          Promise.reject(
            new RepositoryError('conflict', 'This ID is already used in this workspace'),
          ),
      },
    });
    const { user } = await openWizard(dataLayer);
    await fillDetails(user, '001');
    // The icon is aria-hidden, so it is found by its lucide class inside the field.
    const checkMark = () =>
      screen.getByLabelText('Project ID').parentElement!.querySelector('svg.lucide-check');
    await waitFor(() => expect(checkMark()).not.toBeNull());
    await next(user, 'Step 2 of 4: Attributes');
    await next(user, 'Step 3 of 4: Client');
    await next(user, 'Step 4 of 4: Location');
    await user.click(screen.getByRole('button', { name: 'Create project' }));
    // The check found the ID free, but the create request's conflict outranks it.
    expect(await screen.findByText(TAKEN)).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(checkMark()).toBeNull();
  });
});
