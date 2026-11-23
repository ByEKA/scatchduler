import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibraryPage } from '@/pages/LibraryPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('LibraryPage', () => {
  it('lists schedules grouped by workspace, project and Shared with me, shows folder badges, filters via URL params, and links to the editor', async () => {
    const dataLayer = createTestDataLayer();
    const { user } = renderWithProviders(<LibraryPage />, {
      route: '/library',
      path: '/library',
      dataLayer,
    });

    expect(await screen.findByRole('heading', { level: 1, name: 'Library' })).toBeInTheDocument();

    const personalSection = await screen.findByRole('region', { name: 'My workspace' });
    const teamSection = screen.getByRole('region', { name: 'Site Operations' });
    const sharedSection = screen.getByRole('region', { name: 'Shared with me' });

    expect(within(personalSection).getByText('Harbor Logistics Hub')).toBeInTheDocument();
    expect(within(personalSection).getByText('Baselines')).toBeInTheDocument();
    expect(within(personalSection).getAllByText('Monthly Updates').length).toBeGreaterThanOrEqual(
      1,
    );
    expect(within(teamSection).getByText('Tunnel Ventilation Upgrade')).toBeInTheDocument();
    expect(within(sharedSection).getByRole('table', { name: 'Shared schedules' })).toBeInTheDocument();

    // Open link points directly to the schedule editor
    const update2Link = within(personalSection).getByRole('link', { name: 'Update 2' });
    expect(update2Link).toHaveAttribute('href', expect.stringMatching(/\/schedule\?scheduleId=/));

    // Search filters across workspaces and syncs to URL
    const searchBox = screen.getByRole('searchbox', { name: 'Search library' });
    await user.type(searchBox, 'Look-ahead');
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('q=Look-ahead');
      expect(screen.queryByRole('region', { name: 'My workspace' })).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Site Operations' })).toBeInTheDocument();
    });

    // Clear search and test "Hide empty" + "Show archived"
    await user.clear(searchBox);
    await user.click(screen.getByRole('checkbox', { name: 'Hide empty' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('nonEmpty=1');
      // Harbor's Update 2 has 6 activities, Baseline has 0
      expect(screen.getByRole('link', { name: 'Update 2' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Baseline' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: 'Hide empty' }));
    await user.click(screen.getByRole('checkbox', { name: 'Show archived' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('archived=1');
      expect(screen.getByRole('link', { name: 'Recovery plan draft' })).toBeInTheDocument();
    });
  });
});
