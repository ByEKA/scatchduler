import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack } from './local-stack';

const stack = readLocalStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(stack.apiUrl, stack.secretKey, options);
const tag = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const clients: Record<'olive' | 'ed' | 'vi' | 'out', SupabaseClient> = {} as never;
let workspaceId = '';
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

beforeAll(async () => {
  for (const name of ['olive', 'ed', 'vi', 'out'] as const) {
    const email = `${name}.${tag}@example.com`;
    await admin.auth.admin.createUser({
      email,
      password: 'letters12345',
      email_confirm: true,
      user_metadata: { first_name: name },
    });
    clients[name] = createClient(stack.apiUrl, stack.publishableKey, options);
    await clients[name].auth.signInWithPassword({ email, password: 'letters12345' });
  }
  const { data } = await clients.olive.rpc('create_team_workspace', { p_name: `Storage ${tag}` });
  workspaceId = (data as { id: string }).id;
  const ids = await Promise.all(
    (['ed', 'vi'] as const).map(async (n) => (await clients[n].auth.getUser()).data.user!.id),
  );
  await admin.from('workspace_members').insert([
    { workspace_id: workspaceId, user_id: ids[0], role: 'editor' },
    { workspace_id: workspaceId, user_id: ids[1], role: 'viewer' },
  ]);
});

describe('storage policies', () => {
  it('lets editors upload into their workspace folder only', async () => {
    expect(
      (await clients.ed.storage.from('project-covers').upload(`${workspaceId}/a.jpg`, jpeg()))
        .error,
    ).toBeNull();
    expect(
      (await clients.ed.storage.from('project-covers').upload(`not-a-uuid/b.jpg`, jpeg())).error,
    ).not.toBeNull();
    expect(
      (await clients.vi.storage.from('project-covers').upload(`${workspaceId}/v.jpg`, jpeg()))
        .error,
    ).not.toBeNull();
    expect(
      (await clients.out.storage.from('project-covers').upload(`${workspaceId}/o.jpg`, jpeg()))
        .error,
    ).not.toBeNull();
  });

  it('enforces the cover file type', async () => {
    const text = new Blob(['x'], { type: 'text/plain' });
    expect(
      (await clients.ed.storage.from('project-covers').upload(`${workspaceId}/t.txt`, text)).error,
    ).not.toBeNull();
    expect(
      (
        await clients.ed.storage
          .from('schedule-imports')
          .upload(`${workspaceId}/${crypto.randomUUID()}/x.xer`, text)
      ).error,
    ).toBeNull();
  });

  it('signs URLs for members only', async () => {
    expect(
      (await clients.vi.storage.from('project-covers').createSignedUrl(`${workspaceId}/a.jpg`, 60))
        .data?.signedUrl,
    ).toEqual(expect.any(String));
    expect(
      (await clients.out.storage.from('project-covers').createSignedUrl(`${workspaceId}/a.jpg`, 60))
        .data,
    ).toBeNull();
  });

  it('lets editors delete, and nobody else', async () => {
    const remaining = async () =>
      (await admin.storage.from('project-covers').list(workspaceId)).data!.map((f) => f.name);
    await clients.vi.storage.from('project-covers').remove([`${workspaceId}/a.jpg`]);
    expect(await remaining()).toContain('a.jpg');
    await clients.ed.storage.from('project-covers').remove([`${workspaceId}/a.jpg`]);
    expect(await remaining()).not.toContain('a.jpg');
  });
});
