import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { RecentProjects } from '@/features/home/RecentProjects';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('RecentProjects', () => {
  it('shows the five most recent projects and the create card', async () => {
    renderWithProviders(<RecentProjects />, { route: '/home', path: '/home' });
    const region = await screen.findByRole('region', { name: 'Recent projects' });
    await waitFor(() => expect(within(region).getAllByRole('article')).toHaveLength(5));
    expect(within(region).getByRole('button', { name: 'Create new project' })).toBeInTheDocument();
  });

  it('shows three skeletons while loading', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { listRecentProjects: () => new Promise(() => {}) },
    });
    renderWithProviders(<RecentProjects />, { dataLayer });
    expect(await screen.findAllByTestId('project-card-skeleton')).toHaveLength(3);
  });

  it('shows an error that can be retried', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listRecentProjects').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    const { user } = renderWithProviders(<RecentProjects />, { dataLayer });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
  });

  it('refetches the workspaces when they fail to load', async () => {
    const dataLayer = createTestDataLayer();
    vi.spyOn(dataLayer.repository, 'listWorkspaces').mockRejectedValueOnce(
      new RepositoryError('network', 'offline'),
    );
    const { user } = renderWithProviders(<RecentProjects />, { dataLayer });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
  });

  it('refetches the recent projects too when the project list failed with them', async () => {
    const dataLayer = createTestDataLayer();
    const offline = new RepositoryError('network', 'offline');
    vi.spyOn(dataLayer.repository, 'listProjects').mockRejectedValueOnce(offline);
    vi.spyOn(dataLayer.repository, 'listRecentProjects').mockRejectedValueOnce(offline);
    const { user } = renderWithProviders(<RecentProjects />, { dataLayer });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the server. Check your connection and try again.",
    );
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows only the create card without projects and opens the wizard from it', async () => {
    const { user } = renderWithProviders(<RecentProjects />, {
      dataLayer: createTestDataLayer({ scenario: 'empty' }),
    });
    const create = await screen.findByRole('button', { name: 'Create new project' });
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    await user.click(create);
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });
});
