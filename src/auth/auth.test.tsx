import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/auth/RequireAuth';
import { useAuth } from '@/auth/AuthProvider';
import { RepositoryError } from '@/data/errors';
import { usePendingTasks } from '@/hooks/useTasks';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { createFakeAuth, createTestDataLayer } from '@/test/fakes';
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
  it('keeps the cache on sign-in and clears it, except auth keys, when the user changes', async () => {
    const { auth, emit } = createFakeAuth();
    const { queryClient } = renderWithProviders(<p>App</p>, {
      dataLayer: { ...createTestDataLayer(), auth },
    });
    await screen.findByText('App');
    queryClient.setQueryData(['me'], { firstName: 'Nobody' });
    queryClient.setQueryData(['auth', 'callback', 'x'], true);
    act(() => emit({ userId: 'a' }));
    expect(queryClient.getQueryData(['me'])).toBeDefined();
    act(() => emit({ userId: 'b' }));
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(queryClient.getQueryData(['auth', 'callback', 'x'])).toBe(true);
  });

  it('signs out once, with one toast, when several queries fail with unauthorized', async () => {
    const expiredSession = () => Promise.reject(new RepositoryError('unauthorized', 'JWT expired'));
    const dataLayer = createTestDataLayer({
      overrides: { listWorkspaces: expiredSession, listPendingTasks: expiredSession },
    });
    const signOut = vi.spyOn(dataLayer.auth, 'signOut');
    function Two() {
      useWorkspaces();
      usePendingTasks();
      return null;
    }
    // Inside RequireAuth, the queries mount only after the session resolves, so their failures arrive while signed in.
    renderWithProviders(
      <RequireAuth>
        <Two />
      </RequireAuth>,
      { dataLayer },
    );
    expect(
      await screen.findByText('Your session expired. Please sign in again.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText('Your session expired. Please sign in again.')).toHaveLength(1);
  });
});
