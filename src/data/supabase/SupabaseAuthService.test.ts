import { AuthApiError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/data/supabase/client';
import { SupabaseAuthService } from '@/data/supabase/SupabaseAuthService';

function setup() {
  let listener: (event: string, session: { user: { id: string } } | null) => void = () => {};
  const auth = {
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
    onAuthStateChange: vi.fn((cb: typeof listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
  };
  const service = new SupabaseAuthService({ auth } as unknown as AppSupabaseClient, {
    origin: () => 'https://app.example',
  });
  return {
    service,
    auth,
    emit: (event: string, session: { user: { id: string } } | null) => listener(event, session),
  };
}

describe('SupabaseAuthService', () => {
  it('turns a refused Google sign-up into no-access', async () => {
    const { service } = setup();
    await expect(
      service.completeOAuthSignIn(
        'https://app.example/auth/callback?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance',
      ),
    ).rejects.toMatchObject({
      code: 'forbidden',
      message: 'This Google account has no access yet. Ask a workspace owner to invite you.',
    });
  });

  it('reports any other callback problem as a failed sign-in', async () => {
    const { service } = setup();
    for (const url of [
      'https://app.example/auth/callback#error=server_error&error_description=boom',
      'https://app.example/auth/callback',
    ]) {
      await expect(service.completeOAuthSignIn(url)).rejects.toMatchObject({
        code: 'unauthorized',
        message: "Google sign-in didn't work. Please try again.",
      });
    }
  });

  it('exchanges the code once', async () => {
    const { service, auth } = setup();
    await service.completeOAuthSignIn('https://app.example/auth/callback?code=abc&next=%2Fhome');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('builds the Google redirect from the origin and the next path', async () => {
    const { service, auth } = setup();
    await service.signInWithGoogle('/w/1/projects');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.example/auth/callback?next=%2Fw%2F1%2Fprojects' },
    });
    await service.signInWithGoogle(null);
    expect(auth.signInWithOAuth).toHaveBeenLastCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://app.example/auth/callback' },
    });
  });

  it('signs out on this device only', async () => {
    const { service, auth } = setup();
    await service.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('hides whether an account exists but reports rate limits', async () => {
    const { service, auth } = setup();
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('User not found', 400, 'user_not_found'),
    });
    await expect(service.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('Too many requests', 429, 'over_email_send_rate_limit'),
    });
    await expect(service.requestPasswordReset('nobody@example.com')).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('forwards only the user id to listeners', () => {
    const { service, emit } = setup();
    const seen: unknown[] = [];
    service.onAuthStateChange((session) => seen.push(session));
    emit('SIGNED_IN', { user: { id: 'u1' } });
    emit('SIGNED_OUT', null);
    expect(seen).toEqual([{ userId: 'u1' }, null]);
  });
});
