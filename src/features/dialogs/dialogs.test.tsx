import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDialogHostState, useDialogs } from '@/features/dialogs/DialogsProvider';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

describe('dialogs', () => {
  it('keeps only the latest requested dialog', async () => {
    function Twice() {
      const { openDialog } = useDialogs();
      return (
        <button
          onClick={() => {
            openDialog('newSchedule');
            openDialog('newProject');
          }}
        >
          open
        </button>
      );
    }
    const { user } = renderWithProviders(<Twice />);
    await user.click(screen.getByRole('button', { name: 'open' }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it('creates a team workspace', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />, { dataLayer });
    const dialog = await screen.findByRole('dialog', { name: 'New team workspace' });
    expect(
      within(dialog).getByText('Team workspaces hold projects you work on with others.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Field crew');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Workspace created')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
    expect(dataLayer.store.read().workspaces.map((w) => w.name)).toContain('Field crew');
  });

  it('validates the workspace name', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    await user.type(await screen.findByLabelText('Workspace name'), ' a ');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    expect(await screen.findByText('Use 2–40 characters')).toBeInTheDocument();
  });

  it('closes a pristine form at once', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    await screen.findByRole('dialog', { name: 'New team workspace' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });

  it('confirms before discarding a dirty form', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    await user.type(await screen.findByLabelText('Workspace name'), 'Field crew');
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Workspace name')).toHaveValue('Field crew');
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });
});

/** A page button that opens the team workspace dialog. */
function OpenButton() {
  const { openDialog } = useDialogs();
  return (
    <button type="button" onClick={() => openDialog('newTeamWorkspace')}>
      Open workspace dialog
    </button>
  );
}

/** The kind of the dialog DialogHost still keeps mounted for its exit animation, or "none". */
function ClosingProbe() {
  const { closing } = useDialogHostState();
  return (
    <div hidden data-testid="closing-dialog">
      {closing?.kind ?? 'none'}
    </div>
  );
}

/** A test data layer whose createTeamWorkspace waits until `release()` is called. */
function gatedDataLayer(): { dataLayer: TestDataLayer; release: () => void } {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const dataLayer = createTestDataLayer();
  const create = dataLayer.repository.createTeamWorkspace.bind(dataLayer.repository);
  dataLayer.repository.createTeamWorkspace = async (input) => {
    await gate;
    return create(input);
  };
  return { dataLayer, release };
}

describe('form dialog while saving and closing', () => {
  it('creates one workspace when submit fires twice before the pending state renders', async () => {
    const dataLayer = createTestDataLayer();
    const { user, queryClient } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />, {
      dataLayer,
    });
    const dialog = await screen.findByRole('dialog', { name: 'New team workspace' });
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Field crew');
    const submit = within(dialog).getByRole('button', { name: 'Create workspace' });
    // Both clicks land before React re-renders, so the button is still enabled for the second.
    act(() => {
      submit.click();
      submit.click();
    });
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    const created = dataLayer.store.read().workspaces.filter((w) => w.name === 'Field crew');
    expect(created).toHaveLength(1);
  });

  it('stays open while saving and closes when the save succeeds', async () => {
    const { dataLayer, release } = gatedDataLayer();
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />, { dataLayer });
    const dialog = await screen.findByRole('dialog', { name: 'New team workspace' });
    await user.type(within(dialog).getByLabelText('Workspace name'), 'Field crew');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    expect(await within(dialog).findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('newTeamWorkspace');
    release();
    expect(await screen.findByText('Workspace created')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
  });

  it('does not let a late save close the dialog that replaced it', async () => {
    const { dataLayer, release } = gatedDataLayer();
    const { user } = renderWithProviders(<OpenButton />, { dataLayer });
    const opener = screen.getByRole('button', { name: 'Open workspace dialog' });
    await user.click(opener);
    const first = await screen.findByRole('dialog', { name: 'New team workspace' });
    await user.type(within(first).getByLabelText('Workspace name'), 'Field crew');
    await user.click(within(first).getByRole('button', { name: 'Create workspace' }));
    await within(first).findByRole('button', { name: 'Creating…' });
    // Stands in for a link inside the dialog that opens the next one (the page behind is inert).
    fireEvent.click(opener);
    release();
    expect(await screen.findByText('Workspace created')).toBeInTheDocument();
    expect(screen.getByTestId('dialog')).toHaveTextContent('newTeamWorkspace');
    const second = screen.getByRole('dialog', { name: 'New team workspace' });
    expect(within(second).getByLabelText('Workspace name')).toHaveValue('');
  });

  it('returns focus to the opener once the closed dialog has unmounted', async () => {
    const { user } = renderWithProviders(
      <>
        <OpenButton />
        <ClosingProbe />
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Open workspace dialog' });
    await user.click(opener);
    const field = await screen.findByLabelText('Workspace name');
    await waitFor(() => expect(field).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
    expect(screen.getByTestId('closing-dialog')).toHaveTextContent('none');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the first opener when a dialog replaced another', async () => {
    const { user } = renderWithProviders(<OpenButton />);
    const opener = screen.getByRole('button', { name: 'Open workspace dialog' });
    await user.click(opener);
    const firstField = await screen.findByLabelText('Workspace name');
    await waitFor(() => expect(firstField).toHaveFocus());
    // Stands in for a link inside the dialog that opens the next one (the page behind is inert).
    fireEvent.click(opener);
    const secondField = screen.getByLabelText('Workspace name');
    expect(secondField).not.toBe(firstField);
    await waitFor(() => expect(secondField).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByTestId('dialog')).toHaveTextContent('none'));
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('leaves focus where it moved while the closed dialog was going away', async () => {
    const { user } = renderWithProviders(
      <>
        <OpenButton />
        <button type="button">Elsewhere</button>
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Open workspace dialog' });
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    await user.click(opener);
    const field = await screen.findByLabelText('Workspace name');
    await waitFor(() => expect(field).toHaveFocus());
    // Radix hands focus back on a timer after the closed dialog unmounts; focus moves before it.
    fireEvent.keyDown(field, { key: 'Escape' });
    act(() => elsewhere.focus());
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    expect(screen.getByTestId('dialog')).toHaveTextContent('none');
    expect(elsewhere).toHaveFocus();
  });

  it('returns focus to the field after "Keep editing"', async () => {
    const { user } = renderWithProviders(<OpenDialog kind="newTeamWorkspace" />);
    const field = await screen.findByLabelText('Workspace name');
    await user.type(field, 'Field crew');
    await user.keyboard('{Escape}');
    const confirm = await screen.findByRole('alertdialog', { name: 'Discard changes?' });
    await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(field).toHaveFocus());
  });
});
