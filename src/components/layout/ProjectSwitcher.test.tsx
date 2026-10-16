import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';
import { useDialogHostState } from '@/features/dialogs/DialogsProvider';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('ProjectSwitcher', () => {
  it('shows the current project and switches projects', async () => {
    const dl = createTestDataLayer();
    const db = dl.store.read();
    const personal = db.workspaces[0]!;
    const harbor = db.projects.find((p) => p.code === '003')!;
    const { user } = renderWithProviders(<ProjectSwitcher />, {
      route: '/home',
      path: '/home',
      dataLayer: dl,
    });
    const trigger = await screen.findByRole('button', { name: 'Switch project' });
    await waitFor(() => expect(trigger).toHaveTextContent('Riverside Office Tower'));
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Harbor Logistics Hub/ }));
    await waitFor(() => expect(trigger).toHaveTextContent('Harbor Logistics Hub'));
    expect(localStorage.getItem(`ui.lastProjectId.${personal.id}`)).toBe(harbor.id);
  });

  it('opens the new project dialog from the footer', async () => {
    const { user } = renderWithProviders(<ProjectSwitcher />, { route: '/home', path: '/home' });
    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await user.click(screen.getByRole('option', { name: /Create new project/ }));
    expect(screen.getByTestId('dialog')).toHaveTextContent('newProject');
  });

  it('shows a disabled Unavailable button when the workspaces fail to load', async () => {
    renderWithProviders(<ProjectSwitcher />, { dataLayer: createTestDataLayer({ failRate: 1 }) });
    expect(await screen.findByRole('button', { name: 'Unavailable' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Switch project' })).not.toBeInTheDocument();
  });

  it('opens the new project dialog with the trigger as the element to return focus to', async () => {
    // The footer item unmounts with the popover; the dialog returns focus to its opener on close.
    function OpenerProbe() {
      const { active } = useDialogHostState();
      return (
        <div hidden data-testid="opener">
          {active?.opener?.getAttribute('aria-label') ?? 'none'}
        </div>
      );
    }
    const { user } = renderWithProviders(
      <>
        <ProjectSwitcher />
        <OpenerProbe />
      </>,
      { route: '/home', path: '/home' },
    );
    const trigger = await screen.findByRole('button', { name: 'Switch project' });
    await user.click(trigger);
    await user.click(screen.getByRole('option', { name: /Create new project/ }));
    expect(screen.getByTestId('opener')).toHaveTextContent('Switch project');
  });
});
