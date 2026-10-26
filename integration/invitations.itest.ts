import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack } from './local-stack';
import { waitForEmail } from './mailbox';

const stack = readLocalStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(stack.apiUrl, stack.secretKey, options);
const url = `${stack.apiUrl}/functions/v1/invitations`;
const tag = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
let token = '';
let workspaceId = '';

async function call(body: unknown, auth: string | null = token, origin = 'http://localhost:5173') {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: stack.publishableKey,
      origin,
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    origin: response.headers.get('access-control-allow-origin'),
  };
}

beforeAll(async () => {
  const email = `owner.${tag}@example.com`;
  await admin.auth.admin.createUser({
    email,
    password: 'letters12345',
    email_confirm: true,
    user_metadata: { first_name: 'Olive', last_name: 'Owner' },
  });
  const client = createClient(stack.apiUrl, stack.publishableKey, options);
  token = (await client.auth.signInWithPassword({ email, password: 'letters12345' })).data.session!
    .access_token;
  workspaceId = (
    (await client.rpc('create_team_workspace', { p_name: `Crew ${tag}` })).data as { id: string }
  ).id;
});

describe('invitations function', () => {
  // P2 spec D24: the local Kong gateway adds `Access-Control-Allow-Origin: *` to every functions response and
  // answers preflights that carry Access-Control-Request-Method itself, so the test checks the function's own
  // status. The headers are checked on the hosted project (runbook, Task 18).
  it('answers CORS preflight for listed origins only', async () => {
    const preflight = (origin: string) => fetch(url, { method: 'OPTIONS', headers: { origin } });
    expect((await preflight('http://localhost:5173')).status).toBe(204);
    expect((await preflight('https://evil.example')).status).toBe(403);
  });

  it('needs a session', async () => {
    expect(
      (await call({ action: 'invite', workspaceId, email: 'a@example.com', role: 'editor' }, null))
        .status,
    ).toBe(401);
  });

  it('invites, then revoking deletes the never-activated account', async () => {
    const email = `invitee.${tag}@example.com`;
    const after = new Date();
    expect(await call({ action: 'invite', workspaceId, email, role: 'editor' })).toMatchObject({
      status: 200,
      body: { status: 'invited' },
    });
    expect((await waitForEmail(stack.mailUrl, email, { after })).html).toContain(
      `Olive Owner invited you to the Crew ${tag} workspace.`,
    );
    const { data: invitation } = await admin
      .from('workspace_invitations')
      .select('id')
      .eq('email', email)
      .is('revoked_at', null)
      .single();
    expect(await call({ action: 'revoke', invitationId: invitation!.id })).toMatchObject({
      status: 200,
      body: { status: 'revoked' },
    });
    expect((await admin.rpc('account_by_email', { p_email: email })).data).toEqual([]);
  });

  it('adds an existing account directly', async () => {
    const email = `member.${tag}@example.com`;
    await admin.auth.admin.createUser({ email, password: 'letters12345', email_confirm: true });
    expect(await call({ action: 'invite', workspaceId, email, role: 'viewer' })).toMatchObject({
      status: 200,
      body: { status: 'added' },
    });
  });
});
