import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { createTestDataLayer, type TestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

async function callback(query: string, complete: (layer: TestDataLayer) => () => Promise<void>) {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  vi.spyOn(dataLayer.auth, 'completeOAuthSignIn').mockImplementation(complete(dataLayer));
  return renderApp(`/auth/callback${query}`, { dataLayer });
}
const signsIn = (layer: TestDataLayer) => () =>
  layer.auth.signInWithPassword('deniz.kaya@example.com', 'any-password-1');
const fails = (code: 'forbidden' | 'unauthorized') => () => () =>
  Promise.reject(new RepositoryError(code, 'x'));

describe('AuthCallbackPage', () => {
  it('opens the requested page after signing in', async () => {
    const { router } = await callback(`?code=abc&next=${encodeURIComponent('/library')}`, signsIn);
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'));
  });

  it('ignores a next value that leaves the app', async () => {
    const { router } = await callback(
      `?code=abc&next=${encodeURIComponent('//evil.example')}`,
      signsIn,
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it.each([
    ['forbidden', 'This Google account has no access yet. Ask a workspace owner to invite you.'],
    ['unauthorized', "Google sign-in didn't work. Please try again."],
  ] as const)('sends a %s result back to sign-in with its banner', async (code, copy) => {
    const { router } = await callback('?error=x', fails(code));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('says it is signing in while waiting', async () => {
    await callback('?code=abc', () => () => new Promise(() => {}));
    expect(await screen.findByRole('status')).toHaveTextContent('Signing you in…');
  });
});
