import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WelcomeBanner } from '@/features/home/WelcomeBanner';
import { queryKeys } from '@/hooks/query-keys';
import { greetingDate } from '@/lib/format';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('WelcomeBanner', () => {
  it("greets the user with today's date and opens the creation dialogs", async () => {
    const { user } = renderWithProviders(<WelcomeBanner />, { route: '/home', path: '/home' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hello, Deniz' }),
    ).toBeInTheDocument();
    expect(screen.getByText(greetingDate(new Date()))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New schedule' }));
    expect(await screen.findByRole('dialog', { name: 'New schedule' })).toBeInTheDocument();
  });

  it('opens the project wizard', async () => {
    const { user } = renderWithProviders(<WelcomeBanner />, { route: '/home', path: '/home' });
    await user.click(await screen.findByRole('button', { name: 'New project' }));
    expect(await screen.findByRole('dialog', { name: 'New project' })).toBeInTheDocument();
  });

  it('says "Hello" when the user cannot be loaded', async () => {
    renderWithProviders(<WelcomeBanner />, { dataLayer: createTestDataLayer({ failRate: 1 }) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
  });

  it('replaces the greeting skeleton with "Hello" once the user query has failed', async () => {
    const { queryClient } = renderWithProviders(<WelcomeBanner />, {
      dataLayer: createTestDataLayer({
        overrides: { getCurrentUser: () => Promise.reject(new Error('offline')) },
      }),
    });
    await waitFor(() => expect(queryClient.getQueryState(queryKeys.me())?.status).toBe('error'));
    const heading = screen.getByRole('heading', { level: 1, name: 'Hello' });
    // The loading state also reads "Hello", from a visually hidden span next to the skeleton.
    expect(heading.childElementCount).toBe(0);
    expect(heading).toHaveTextContent(/^Hello$/);
  });
});
