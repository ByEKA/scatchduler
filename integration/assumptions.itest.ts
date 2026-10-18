import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack, type LocalStack } from './local-stack';
import { tokenHashFrom, waitForEmail } from './mailbox';

let stack: LocalStack;
let admin: SupabaseClient;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const unique = () => `check.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
const anon = () => createClient(stack.apiUrl, stack.publishableKey, options);

async function invite(email: string, data?: Record<string, string>) {
  const after = new Date();
  const { data: created, error } = await admin.auth.admin.inviteUserByEmail(
    email,
    data ? { data } : undefined,
  );
  expect(error).toBeNull();
  return {
    userId: created.user!.id,
    mail: await waitForEmail(stack.mailUrl, email, { after, subject: "You're invited to AppName" }),
  };
}

beforeAll(() => {
  stack = readLocalStack();
  admin = createClient(stack.apiUrl, stack.secretKey, options);
});

describe('local stack assumptions (P2 spec §11)', () => {
  it('V2: status exposes the URL and two different keys', () => {
    expect(stack.apiUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    expect(stack.publishableKey).not.toBe('');
    expect(stack.secretKey).not.toBe(stack.publishableKey);
  });

  it('public sign-up is disabled', async () => {
    const { error } = await anon().auth.signUp({ email: unique(), password: 'letters12345' });
    expect(error).not.toBeNull();
  });

  it('V1(a), V3, V5: an admin invite works and uses our template with metadata', async () => {
    const { mail } = await invite(unique(), {
      inviter_name: 'Deniz Kaya',
      workspace_name: 'Site Operations',
    });
    expect(mail.html).toContain('Deniz Kaya invited you to the Site Operations workspace.');
    expect(mail.html).toContain('/accept-invite?token_hash=');
    expect(tokenHashFrom(mail.html)).toMatch(/^[\w-]{20,}$/);
  });

  it('V5: an invite without metadata uses the generic sentence', async () => {
    const { mail } = await invite(unique());
    expect(mail.html).toContain("You've been invited to join AppName.");
  });

  it('V1(b): re-inviting an unconfirmed account sends a fresh link with the new metadata', async () => {
    const email = unique();
    const first = await invite(email, { inviter_name: 'Deniz Kaya', workspace_name: 'Alpha' });
    await admin.auth.admin.updateUserById(first.userId, {
      user_metadata: { inviter_name: 'Mert Demir', workspace_name: 'Beta' },
    });
    const second = await invite(email, { inviter_name: 'Mert Demir', workspace_name: 'Beta' });
    expect(second.mail.html).toContain('Mert Demir invited you to the Beta workspace.');
    expect(tokenHashFrom(second.mail.html)).not.toBe(tokenHashFrom(first.mail.html));
  });

  it('V1(c), V4: verifying an invite confirms the account; the password policy applies', async () => {
    const email = unique();
    const { userId, mail } = await invite(email);
    const client = anon();
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHashFrom(mail.html),
      type: 'invite',
    });
    expect(error).toBeNull();
    const { data } = await admin.auth.admin.getUserById(userId);
    expect(data.user?.email_confirmed_at).toBeTruthy();
    for (const weak of ['short12', 'onlyletterspassword']) {
      const result = await client.auth.updateUser({ password: weak });
      expect(result.error?.code).toBe('weak_password');
    }
    expect((await client.auth.updateUser({ password: 'letters12345' })).error).toBeNull();
  });

  it("V1(c), V1(e): a reset requested by the app's PKCE client verifies in another browser and confirms a pending account", async () => {
    const email = unique();
    const { userId } = await invite(email);
    const pkceClient = () => {
      const memory = new Map<string, string>();
      const storage = {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v);
        },
        removeItem: (k: string) => {
          memory.delete(k);
        },
      };
      return createClient(stack.apiUrl, stack.publishableKey, {
        auth: {
          flowType: 'pkce',
          storage,
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    };
    const after = new Date();
    await pkceClient().auth.resetPasswordForEmail(email);
    const mail = await waitForEmail(stack.mailUrl, email, {
      after,
      subject: 'Reset your AppName password',
    });
    const otherBrowser = pkceClient(); // fresh storage: no code verifier from the request
    expect(
      (
        await otherBrowser.auth.verifyOtp({
          token_hash: tokenHashFrom(mail.html),
          type: 'recovery',
        })
      ).error,
    ).toBeNull();
    expect((await otherBrowser.auth.getSession()).data.session).not.toBeNull();
    const { data } = await admin.auth.admin.getUserById(userId);
    expect(data.user?.email_confirmed_at).toBeTruthy();
  });
});
