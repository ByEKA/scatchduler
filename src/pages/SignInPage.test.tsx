import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequireAuth } from '@/auth/RequireAuth';
import { SignInPage } from '@/pages/SignInPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function signedOut() {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  return dataLayer;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SignInPage', () => {
  it('signs in with any email in demo mode and opens Home', async () => {
    const { user } = renderWithProviders(<SignInPage />, {
      route: '/sign-in',
      path: '/sign-in',
      dataLayer: await signedOut(),
    });
    expect(
      await screen.findByText('Demo mode: any email signs you in as the demo user.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'lab@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });

  it('validates the email address', async () => {
    const { user } = renderWithProviders(<SignInPage />, {
      route: '/sign-in',
      path: '/sign-in',
      dataLayer: await signedOut(),
    });
    await user.type(await screen.findByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('sends signed-in visitors to Home', async () => {
    renderWithProviders(<SignInPage />, { route: '/sign-in', path: '/sign-in' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });

  it('replaces the form with a notice when a sign-in link was sent', async () => {
    const dataLayer = await signedOut();
    dataLayer.auth.signInWithEmail = async () => ({ status: 'link-sent' as const });
    const { user } = renderWithProviders(<SignInPage />, {
      route: '/sign-in',
      path: '/sign-in',
      dataLayer,
    });
    await user.type(await screen.findByLabelText('Email'), 'lab@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Check your inbox for a sign-in link.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('returns to the page the visitor asked for before signing in', async () => {
    const { user } = renderWithProviders(
      <Routes>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route
          path="/library"
          element={
            <RequireAuth>
              <p>Library page</p>
            </RequireAuth>
          }
        />
      </Routes>,
      { route: '/library?tab=all', dataLayer: await signedOut() },
    );
    await user.type(await screen.findByLabelText('Email'), 'lab@example.com');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Library page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/library?tab=all');
  });

  it('treats a blank VITE_DATA_SOURCE as mock and hides the demo note otherwise', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', '');
    const blank = renderWithProviders(<SignInPage />, {
      route: '/sign-in',
      path: '/sign-in',
      dataLayer: await signedOut(),
    });
    expect(
      await screen.findByText('Demo mode: any email signs you in as the demo user.'),
    ).toBeInTheDocument();
    blank.unmount();
    vi.stubEnv('VITE_DATA_SOURCE', 'supabase');
    renderWithProviders(<SignInPage />, {
      route: '/sign-in',
      path: '/sign-in',
      dataLayer: await signedOut(),
    });
    await screen.findByLabelText('Email');
    expect(screen.queryByText(/Demo mode/)).not.toBeInTheDocument();
  });
});
