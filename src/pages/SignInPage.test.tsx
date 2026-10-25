import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInPage } from '@/pages/SignInPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function signedOut() {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  return dataLayer;
}
const at = (state?: unknown) => ({ route: { pathname: '/sign-in', state }, path: '/sign-in' });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SignInPage', () => {
  it('signs in with email and password in demo mode', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    expect(
      await screen.findByText('Demo mode: any email and password sign you in.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    await user.type(screen.getByLabelText('Email'), 'lab@example.com');
    await user.type(screen.getByLabelText('Password'), 'any-password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });

  it('validates both fields', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    await user.type(await screen.findByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('explains a wrong password without ending any session', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    await user.type(await screen.findByLabelText('Email'), 'deniz.kaya@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    expect(
      screen.queryByText('Your session expired. Please sign in again.'),
    ).not.toBeInTheDocument();
  });

  it('shows and hides the password', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    const input = await screen.findByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('continues with Google and returns to the requested page', async () => {
    const dataLayer = await signedOut();
    const google = vi.spyOn(dataLayer.auth, 'signInWithGoogle');
    const { user } = renderWithProviders(<SignInPage />, {
      ...at({ from: { pathname: '/w/x/projects', search: '', hash: '' } }),
      dataLayer,
    });
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(google).toHaveBeenCalledWith('/w/x/projects');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/w/x/projects'));
  });

  it.each([
    ['no-access', 'This Google account has no access yet. Ask a workspace owner to invite you.'],
    ['failed', "Google sign-in didn't work. Please try again."],
  ])('shows the %s banner from the callback', async (authError, copy) => {
    renderWithProviders(<SignInPage />, { ...at({ authError }), dataLayer: await signedOut() });
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it('explains invite-only access and hides Google when it is off', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'supabase');
    renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    expect(
      await screen.findByText('Access is by invitation. Ask a workspace owner to invite you.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('sends signed-in visitors to Home', async () => {
    renderWithProviders(<SignInPage />, at());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });
});
