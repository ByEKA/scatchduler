import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gunzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack } from './local-stack';
import { makeSupabaseRepositoryFixture } from './supabase-fixture';

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

describe('schedule-imports deletes and the interim import (spec §2.4, §4.9)', () => {
  let projectId = '';
  const importPath = () => `${workspaceId}/${projectId}/${crypto.randomUUID()}.xer.gz`;
  const gz = () => new Blob([new Uint8Array([0x1f, 0x8b, 8, 0])]);
  const exists = async (path: string) => {
    const folder = path.slice(0, path.lastIndexOf('/'));
    return (await admin.storage.from('schedule-imports').list(folder)).data!.some((f) =>
      path.endsWith(`/${f.name}`),
    );
  };
  const reference = (client: SupabaseClient, path: string, code: string) =>
    client.from('schedules').insert({
      project_id: projectId,
      name: code,
      code,
      source: 'import',
      source_format: 'xer',
      source_file_name: `${code}.xer`,
      source_file_path: path,
      source_file_size: 4,
    });

  beforeAll(async () => {
    const { data } = await clients.olive
      .from('projects')
      .insert({ workspace_id: workspaceId, code: 'SI1', name: 'Storage imports' })
      .select('id')
      .single();
    projectId = (data as { id: string }).id;
  });

  it('lets an editor delete only an unreferenced object they uploaded', async () => {
    const [own, ref, theirs] = [importPath(), importPath(), importPath()];
    await clients.ed.storage.from('schedule-imports').upload(own, gz());
    await clients.ed.storage.from('schedule-imports').upload(ref, gz());
    await clients.olive.storage.from('schedule-imports').upload(theirs, gz());
    expect((await reference(clients.ed, ref, 'REF-1')).error).toBeNull();
    await clients.ed.storage.from('schedule-imports').remove([own, ref, theirs]);
    expect([await exists(own), await exists(ref), await exists(theirs)]).toEqual([
      false,
      true,
      true,
    ]);
  });

  it('lets owners delete any object of their workspace', async () => {
    const ref = importPath();
    await clients.ed.storage.from('schedule-imports').upload(ref, gz());
    expect((await reference(clients.ed, ref, 'REF-2')).error).toBeNull();
    await clients.olive.storage.from('schedule-imports').remove([ref]);
    expect(await exists(ref)).toBe(false);
  });

  it('stores an interim import gzipped under its project, with its format', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const schedule = await f.repository.importSchedule({
      projectId: f.projectIds['002']!,
      name: 'Rev 8',
      code: 'R8',
      file: new File(['ERMHDR\t20.12'], 'rev8.XER'),
    });
    const { data } = await admin
      .from('schedules')
      .select('source_format, source_file_size, source_file_path')
      .eq('id', schedule.id)
      .single();
    const row = data as {
      source_format: string;
      source_file_size: number;
      source_file_path: string;
    };
    expect(row).toMatchObject({ source_format: 'xer', source_file_size: 12 });
    expect(row.source_file_path).toMatch(
      new RegExp(`^${f.workspaces.personal}/${f.projectIds['002']}/[0-9a-f-]{36}\\.xer\\.gz$`),
    );
    const { data: blob } = await admin.storage
      .from('schedule-imports')
      .download(row.source_file_path);
    expect(new TextDecoder().decode(gunzipSync(new Uint8Array(await blob!.arrayBuffer())))).toBe(
      'ERMHDR\t20.12',
    );
  });
});
