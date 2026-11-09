import { describe, expect, it } from 'vitest';
import { runRepositoryContract } from '@/test/contract/repository.contract';
import { makeUpdateProjectInput } from '@/test/fakes';
import { makeSupabaseRepositoryFixture } from './supabase-fixture';

runRepositoryContract('supabase', makeSupabaseRepositoryFixture);

describe('rows hidden by RLS (Supabase only, spec D34)', () => {
  it("answers not_found for another workspace's project", async () => {
    const f = await makeSupabaseRepositoryFixture();
    const other = await makeSupabaseRepositoryFixture();
    const hidden = other.projectIds['001']!;
    const notFound = { code: 'not_found', message: 'Project not found' };
    await expect(f.repository.getProject(hidden)).rejects.toMatchObject(notFound);
    const mine = await f.repository.getProject(f.projectIds['001']!);
    await expect(
      f.repository.updateProject({ ...makeUpdateProjectInput(mine), projectId: hidden }),
    ).rejects.toMatchObject(notFound);
  });
});
