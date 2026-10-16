import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanBadge } from '@/components/layout/PlanBadge';
import { queryKeys } from '@/hooks/query-keys';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('PlanBadge', () => {
  it('shows the trial countdown and links to billing', async () => {
    renderWithProviders(<PlanBadge />);
    const badge = await screen.findByRole('link', { name: 'Trial: 9 days left. Upgrade now.' });
    expect(badge).toHaveAttribute('href', '/settings/billing');
    expect(badge).toHaveTextContent('9 days left');
    expect(within(badge).getByText('Trial')).toBeInTheDocument();
    expect(within(badge).getByText('9d')).toBeInTheDocument();
  });

  it('says the trial ended after the end date', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        getSubscription: async () => ({ plan: 'trial', trialEndsAt: '2020-01-01T00:00:00.000Z' }),
      },
    });
    renderWithProviders(<PlanBadge />, { dataLayer });
    expect(
      await screen.findByRole('link', { name: 'Trial ended. Upgrade now.' }),
    ).toHaveTextContent('Trial ended');
  });

  it('drops the TRIAL label once the trial has ended', async () => {
    const dataLayer = createTestDataLayer({
      overrides: {
        getSubscription: async () => ({ plan: 'trial', trialEndsAt: '2020-01-01T00:00:00.000Z' }),
      },
    });
    renderWithProviders(<PlanBadge />, { dataLayer });
    const badge = await screen.findByRole('link', { name: 'Trial ended. Upgrade now.' });
    expect(within(badge).queryByText('Trial')).not.toBeInTheDocument();
    expect(within(badge).getByText('Trial ended')).toBeInTheDocument();
    expect(within(badge).getByText('Ended')).toBeInTheDocument();
  });

  it('renders nothing on paid plans', async () => {
    const dataLayer = createTestDataLayer({
      overrides: { getSubscription: async () => ({ plan: 'pro', trialEndsAt: null }) },
    });
    const { queryClient } = renderWithProviders(<PlanBadge />, { dataLayer });
    await waitFor(() => expect(queryClient.getQueryData(queryKeys.subscription())).toBeDefined());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
