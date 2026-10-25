import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '@/data/auth';

export interface AuthFixture {
  auth: AuthService;
  email: string;
  password: string;
  badPassword: string;
  freshToken(): Promise<string>;
}
const expired = { code: 'validation', message: 'This link has expired or was already used.' };

export function runAuthContract(label: string, makeFixture: () => Promise<AuthFixture>): void {
  describe(`AuthService contract — ${label}`, () => {
    it('signs in with the right password and out again, telling listeners', async () => {
      const f = await makeFixture();
      const seen: Array<string | null> = [];
      const off = f.auth.onAuthStateChange((s) => seen.push(s?.userId ?? null));
      await f.auth.signOut();
      expect(await f.auth.getSession()).toBeNull();
      await f.auth.signInWithPassword(f.email, f.password);
      expect(await f.auth.getSession()).not.toBeNull();
      await vi.waitFor(() => expect(seen.at(-1)).not.toBeNull());
      expect(seen).toContain(null);
      off();
    });

    it('refuses a wrong password with the pinned message', async () => {
      const f = await makeFixture();
      await f.auth.signOut();
      await expect(f.auth.signInWithPassword(f.email, f.badPassword)).rejects.toMatchObject({
        code: 'unauthorized',
        message: 'Wrong email or password',
      });
    });

    it('accepts a reset request for an unknown email', async () => {
      const f = await makeFixture();
      await expect(
        f.auth.requestPasswordReset(`nobody.${Date.now()}@example.com`),
      ).resolves.toBeUndefined();
    });

    it('verifies an email link once', async () => {
      const f = await makeFixture();
      await f.auth.signOut();
      const token = await f.freshToken();
      await f.auth.verifyEmailLink(token, 'recovery');
      expect(await f.auth.getSession()).not.toBeNull();
      await expect(f.auth.verifyEmailLink(token, 'recovery')).rejects.toMatchObject(expired);
      await expect(f.auth.verifyEmailLink('expired', 'recovery')).rejects.toMatchObject(expired);
    });
  });
}
