import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RequireAuth } from '@/auth/RequireAuth';
import { useAuth } from '@/auth/AuthProvider';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

describe('auth', () => {
  it('redirects signed-out visitors to /sign-in', async () => {
    const dataLayer = createTestDataLayer();
    await dataLayer.auth.signOut();
    renderWithProviders(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
      { route: '/home', path: '/home', dataLayer },
    );
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/sign-in'));
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders protected content for signed-in users', async () => {
    renderWithProviders(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
      { route: '/home', path: '/home' },
    );
    expect(await screen.findByText('Secret')).toBeInTheDocument();
  });

  it('clears cached data on sign-out', async () => {
    function SignOut() {
      const { signOut } = useAuth();
      return <button onClick={() => void signOut()}>Sign out</button>;
    }
    const { user, queryClient } = renderWithProviders(<SignOut />);
    queryClient.setQueryData(['me'], { firstName: 'Deniz' });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(queryClient.getQueryData(['me'])).toBeUndefined());
  });

  it('shows a loading spinner while the session is read', async () => {
    renderWithProviders(
      <RequireAuth>
        <p>Secret</p>
      </RequireAuth>,
      { route: '/home', path: '/home' },
    );
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
    expect(await screen.findByText('Secret')).toBeInTheDocument();
  });
});
