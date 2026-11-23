import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { Database } from '@/data/supabase/database.types';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import { makeSampleScheduleDocument } from '@/test/fakes';
import { readLocalStack } from './local-stack';
import { makeSupabaseRepositoryFixture, signedInClient } from './supabase-fixture';

const PASSWORD = 'letters12345';
const stack = readLocalStack();
const admin = createClient<Database>(stack.apiUrl, stack.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function freshEmail(prefix: string): string {
  return `${prefix}.${Date.now().toString(36)}${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function createSignedInUser(firstName: string, lastName: string) {
  const email = freshEmail(firstName.toLowerCase());
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });
  if (error || !data.user) {
    throw new Error(`Failed to create user ${email}: ${error?.message ?? 'no user'}`);
  }
  const client = await signedInClient(email, PASSWORD);
  return { userId: data.user.id, email, client, repository: new SupabaseRepository(client) };
}

describe('programs, folders, copySchedule and library on the local stack', () => {
  it('copies a schedule with a materialized snapshot in schedule-data so editing the copy leaves the source untouched (V2)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const harborId = f.projectIds['003']!;
    const schedules = await f.repository.listSchedules(harborId);
    const up2 = schedules.find((s) => s.code === 'UP-02')!;

    const folders = await f.repository.listFolders(harborId);
    const baselinesFolder = folders.find((fl) => fl.name === 'Baselines')!;

    const copy = await f.repository.copySchedule({
      scheduleId: up2.id,
      name: 'Update 2 Scenario B',
      code: 'UP-02-B',
      folderId: baselinesFolder.id,
    });
    expect(copy).toMatchObject({
      projectId: harborId,
      folderId: baselinesFolder.id,
      copiedFromId: up2.id,
      name: 'Update 2 Scenario B',
      code: 'UP-02-B',
      isCurrent: false,
      baseline: 'none',
      updateNumber: null,
      hasScheduleData: true,
      dataRevision: 1,
      activityCount: 6,
    });

    const sourceLoaded = await f.repository.getScheduleDocument(up2.id);
    const copyLoaded = await f.repository.getScheduleDocument(copy.id);
    expect(copyLoaded.document).toEqual(sourceLoaded.document);

    // Edit and save the copy; verify source snapshot in schedule-data is unchanged
    await f.repository.acquireScheduleLock(copy.id);
    const editedDoc = makeSampleScheduleDocument({ activities: [] });
    await f.repository.saveScheduleDocument({
      scheduleId: copy.id,
      expectedRevision: 1,
      document: editedDoc,
    });

    expect((await f.repository.getScheduleDocument(up2.id)).document?.activities).toHaveLength(6);
    expect((await f.repository.getScheduleDocument(copy.id)).document?.activities).toHaveLength(0);
  });

  it('isolates getLibraryData() for a share recipient who is not a member of the shared workspace (R7)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const harborId = f.projectIds['003']!;
    const schedules = await f.repository.listSchedules(harborId);
    const up2 = schedules.find((s) => s.code === 'UP-02')!;

    // Create an external user and share UP-02 with them directly
    const recipient = await createSignedInUser('Selin', 'Yilmaz');
    const { error: shareError } = await admin.from('schedule_shares').insert({
      schedule_id: up2.id,
      shared_by: f.users.current.id,
      shared_with: recipient.userId,
    });
    expect(shareError).toBeNull();

    const lib = await recipient.repository.getLibraryData();
    // Recipient only sees their own personal workspace (0 projects) in workspaces/projects/folders/schedules
    expect(lib.workspaces).toHaveLength(1);
    expect(lib.projects).toEqual([]);
    expect(lib.folders).toEqual([]);
    expect(lib.schedules).toEqual([]);
    // And sees the shared schedule in sharedWithMe
    expect(lib.sharedWithMe).toEqual([
      expect.objectContaining({
        scheduleId: up2.id,
        scheduleName: 'Update 2',
        projectId: harborId,
        projectName: 'Harbor Logistics Hub',
      }),
    ]);
  });
});
