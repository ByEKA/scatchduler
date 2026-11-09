import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@/data/supabase/database.types';
import { makeNewProjectInput, makeUpdateProjectInput } from '@/test/fakes';
import { readLocalStack } from './local-stack';
import { makeSupabaseRepositoryFixture } from './supabase-fixture';

const stack = readLocalStack();
const admin = createClient<Database>(stack.apiUrl, stack.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const jpeg = (name: string) =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });

async function coverPath(projectId: string): Promise<string> {
  const { data, error } = await admin
    .from('projects')
    .select('cover_image_path')
    .eq('id', projectId)
    .single();
  if (error || !data.cover_image_path) throw new Error(`No cover for ${projectId}`);
  return data.cover_image_path;
}
const stored = async (bucket: string, path: string) =>
  (await admin.storage.from(bucket).download(path)).error === null;

describe('projects on the local stack', () => {
  it('deletes the old cover object when a project gets a new one', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const created = await f.repository.createProject(
      makeNewProjectInput(f.workspaces.personal, { code: 'CV1', coverImage: jpeg('a.jpg') }),
    );
    const first = await coverPath(created.id);
    await f.repository.updateProject(makeUpdateProjectInput(created, { cover: jpeg('b.jpg') }));
    const second = await coverPath(created.id);
    expect(second).not.toBe(first);
    expect(await stored('project-covers', second)).toBe(true);
    expect(await stored('project-covers', first)).toBe(false);
  });
});
