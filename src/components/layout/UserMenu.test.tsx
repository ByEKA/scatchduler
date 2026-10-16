import { screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { UserMenu } from '@/components/layout/UserMenu';
import { brand } from '@/config/brand';
import { queryKeys } from '@/hooks/query-keys';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

it('shows the account, toggles the theme and signs out', async () => {
  const { user } = renderWithProviders(<UserMenu />, { route: '/home' });
  await user.click(await screen.findByRole('button', { name: 'Account menu for Deniz Kaya' }));
  expect(screen.getByText('deniz.kaya@example.com')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Documentation/ })).toHaveAttribute(
    'href',
    brand.docsUrl,
  );
  await user.click(screen.getByRole('menuitem', { name: 'Light mode' }));
  expect(document.documentElement).not.toHaveClass('dark');
  await user.click(screen.getByRole('button', { name: 'Account menu for Deniz Kaya' }));
  expect(screen.getByRole('menuitem', { name: 'Dark mode' })).toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Log out' }));
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'));
});

it('shows a nameless account trigger when the user fails to load', async () => {
  const dataLayer = createTestDataLayer({
    overrides: { getCurrentUser: () => Promise.reject(new Error('Network error')) },
  });
  const { queryClient } = renderWithProviders(<UserMenu />, { route: '/home', dataLayer });
  await waitFor(() => expect(queryClient.getQueryState(queryKeys.me())?.status).toBe('error'));
  const trigger = screen.getByRole('button', { name: 'Account menu' });
  expect(trigger.textContent).toBe('');
  expect(trigger.querySelector('svg.lucide-user')).not.toBeNull();
  expect(trigger.querySelector('[data-slot="skeleton"]')).toBeNull();
  expect(screen.queryByText('Deniz')).not.toBeInTheDocument();
});
