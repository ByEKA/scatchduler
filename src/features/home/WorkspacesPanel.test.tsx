import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { RecentProjects } from '@/features/home/RecentProjects';
import { WorkspacesPanel } from '@/features/home/WorkspacesPanel';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('WorkspacesPanel', () => {
  it('lists workspaces with counts and marks the current one', async () => {
    const dataLayer = createTestDataLayer();
    const team = dataLayer.store.read().workspaces[1]!;
    const { user } = renderWithProviders(<WorkspacesPanel />, {
      route: '/home',
      path: '/home',
      dataLayer,
    });
    const mine = await screen.findByRole('button', { name: /My workspace/ });
    expect(mine).toHaveTextContent('6 projects');
    expect(mine).toHaveAttribute('aria-current', 'true');
    const ops = screen.getByRole('button', { name: /Site Operations/ });
    expect(ops).toHaveTextContent('1 project');
    expect(ops).not.toHaveAttribute('aria-current');
    await user.click(ops);
    expect(screen.getByTestId('location')).toHaveTextContent(`/w/${team.id}/projects`);
  });

  it('invites creating a team workspace when there is none', async () => {
    const { user } = renderWithProviders(<WorkspacesPanel />, {
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    expect(await screen.findByText('No team workspaces yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New team workspace' }));
    expect(await screen.findByRole('dialog', { name: 'New team workspace' })).toBeInTheDocument();
  });

  it('offers a new team workspace in the footer once team workspaces exist', async () => {
    const { user } = renderWithProviders(<WorkspacesPanel />);
    await screen.findByRole('button', { name: /Site Operations/ });
    expect(screen.queryByText('No team workspaces yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New team workspace' }));
    expect(await screen.findByRole('dialog', { name: 'New team workspace' })).toBeInTheDocument();
  });

  it('shows two skeleton rows while the workspaces load', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { listWorkspaces: () => new Promise(() => {}) },
    });
    renderWithProviders(<WorkspacesPanel />, { dataLayer });
    expect(await screen.findAllByTestId('workspace-row-skeleton')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Workspaces' })).toBeInTheDocument();
  });

  it('shows an error whose Retry refetches the workspaces', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listWorkspaces').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    const { user } = renderWithProviders(<WorkspacesPanel />, { dataLayer });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /My workspace/ })).toHaveTextContent(
      '6 projects',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps its rows when only the project list fails', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listProjects').mockRejectedValue(
      new RepositoryError('network', 'offline'),
    );
    renderWithProviders(
      <>
        <WorkspacesPanel />
        <RecentProjects />
      </>,
      { dataLayer },
    );
    // Recent projects shows the failed project list, so the context has reached its error state.
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1));
    const region = screen.getByRole('region', { name: 'Workspaces' });
    expect(region).not.toContainElement(screen.getByRole('alert'));
    expect(screen.getByRole('button', { name: /My workspace/ })).toHaveTextContent('6 projects');
  });

  it('returns focus to New team workspace after creating the first team workspace', async () => {
    const { user } = renderWithProviders(<WorkspacesPanel />, {
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    await user.click(await screen.findByRole('button', { name: 'New team workspace' }));
    await user.type(await screen.findByLabelText('Workspace name'), 'Crew A');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New team workspace' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('button', { name: /Crew A/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New team workspace' })).toHaveFocus(),
    );
  });
});
