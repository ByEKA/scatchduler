import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { encodeScheduleDocument, SCHEDULE_DATA_BUCKET } from '@/data/schedule-codec';
import type {
  ScheduleActivity,
  ScheduleDocument,
  ScheduleRelationship,
} from '@/data/schedule-types';
import type { Database } from '@/data/supabase/database.types';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import { makeImportScheduleInput, makeSampleScheduleDocument } from '@/test/fakes';
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

async function listFolder(bucket: string, folder: string): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(folder);
  if (error) throw error;
  return (data ?? []).map((entry) => entry.name);
}

async function objectExists(bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = slash >= 0 ? path.slice(0, slash) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const entries = await listFolder(bucket, folder);
  return entries.includes(name);
}

/** Builds a deterministic 50k-activity / 150k-relationship ScheduleDocument for V6. */
function makeLargeScheduleDocument(
  activityCount: number,
  relationshipCount: number,
): ScheduleDocument {
  const base = makeSampleScheduleDocument({ sourceFormat: null });
  const activities: ScheduleActivity[] = Array.from({ length: activityCount }, (_, i) => {
    const isMilestone = i === 0 || i === activityCount - 1;
    const duration = isMilestone ? 0 : 480 * ((i % 10) + 1);
    return {
      id: `a:${i}`,
      code: `A${String(i + 1).padStart(5, '0')}`,
      name: `Activity ${i + 1}`,
      wbsId: 'wbs:1',
      calendarId: 'cal:1',
      type: i === 0 ? 'start_milestone' : i === activityCount - 1 ? 'finish_milestone' : 'task',
      order: i,
      originalDuration: duration,
      remainingDuration: duration,
      status: 'not_started',
      actualStart: null,
      actualFinish: null,
      percent: { duration: 0, physical: null, type: 'duration' },
      constraint: null,
      secondaryConstraint: null,
      notes: null,
      flags: { manual: false, elapsed: false, resourceDependent: false },
      keys: { taskId: null, uid: null, guid: null },
      sourceDates: null,
    };
  });

  const relationships: ScheduleRelationship[] = [];
  for (let i = 0; i < relationshipCount; i++) {
    const predIdx = i % (activityCount - 1);
    const stride = Math.floor(i / (activityCount - 1)) + 1;
    const succIdx = Math.min(activityCount - 1, predIdx + stride);
    relationships.push({
      id: `r:${i}`,
      predecessorId: `a:${predIdx}`,
      successorId: `a:${succIdx}`,
      type: i % 5 === 0 ? 'SS' : 'FS',
      lagMinutes: i % 7 === 0 ? 480 : 0,
      lagElapsed: false,
    });
  }

  return {
    ...base,
    activities,
    relationships,
    computed: null,
  };
}

describe('schedule documents and locks on the local stack', () => {
  it('enforces multi-user lock contention, R11 guards, and owner force release (R1, R3, R11)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const teamWorkspaceId = f.workspaces.team!;
    const tunnelProjectId = f.projectIds['T-01']!;
    const [la42] = await f.repository.listSchedules(tunnelProjectId);

    const mertClient = await signedInClient(f.users.mert!.email, PASSWORD);
    const mertRepo = new SupabaseRepository(mertClient);
    const secondEditor = await createSignedInUser('Deniz', 'Kaya');
    const { error: memberError } = await admin.from('workspace_members').insert({
      workspace_id: teamWorkspaceId,
      user_id: secondEditor.userId,
      role: 'editor',
    });
    if (memberError) throw memberError;

    // Editor A (Mert) acquires lock.
    const mertLock = await mertRepo.acquireScheduleLock(la42!.id);
    expect(mertLock.userId).toBe(f.users.mert!.id);
    expect(mertLock.userName).toBe('Mert Demir');

    // Editor B is blocked from acquiring, changing statusDate (R11), archiving (R11), and force-releasing (R3).
    await expect(secondEditor.repository.acquireScheduleLock(la42!.id)).rejects.toMatchObject({
      code: 'conflict',
      message: 'This schedule is being edited by Mert Demir.',
    });
    await expect(
      secondEditor.repository.updateScheduleDetails({
        scheduleId: la42!.id,
        name: la42!.name,
        code: la42!.code!,
        statusDate: '2026-10-30',
        notes: la42!.notes,
        baseline: la42!.baseline,
        updateNumber: la42!.updateNumber,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'This schedule is being edited by Mert Demir. Try again once they finish.',
    });
    await expect(
      secondEditor.repository.setSchedulesArchived({ scheduleIds: [la42!.id], archived: true }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'This schedule is being edited by Mert Demir. Try again once they finish.',
    });
    await expect(secondEditor.repository.forceReleaseScheduleLock(la42!.id)).rejects.toMatchObject({
      code: 'forbidden',
    });

    // Owner force-releases the lock, allowing Editor B to acquire it.
    await f.repository.forceReleaseScheduleLock(la42!.id);
    const denizLock = await secondEditor.repository.acquireScheduleLock(la42!.id);
    expect(denizLock.userId).toBe(secondEditor.userId);
    await secondEditor.repository.releaseScheduleLock(la42!.id);
  });

  it('materializes idempotently without moving updatedAt and cleans up redundant uploads (R7)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const metro = f.projectIds['002']!;
    const imported = await f.repository.importSchedule(await makeImportScheduleInput(metro));
    const originalUpdatedAt = imported.updatedAt;
    const folder = `${f.workspaces.personal}/${metro}/${imported.id}`;

    const docA = makeSampleScheduleDocument({
      sourceFormat: 'xer',
      settings: {
        ...makeSampleScheduleDocument().settings,
        displayMode: 'as_imported',
        statusDate: '2026-10-15T08:00',
      },
    });
    const docB = makeSampleScheduleDocument({
      sourceFormat: 'xer',
      settings: {
        ...makeSampleScheduleDocument().settings,
        displayMode: 'calculated',
        statusDate: '2026-10-18T08:00',
      },
    });

    expect(
      await f.repository.materializeScheduleDocument({ scheduleId: imported.id, document: docA }),
    ).toEqual({ dataRevision: 1 });
    const afterFirst = (await f.repository.listSchedules(metro)).find((s) => s.id === imported.id)!;
    expect(afterFirst.updatedAt).toBe(originalUpdatedAt);
    expect(afterFirst.hasScheduleData).toBe(true);
    expect(afterFirst.dataRevision).toBe(1);
    const filesAfterFirst = await listFolder(SCHEDULE_DATA_BUCKET, folder);
    expect(filesAfterFirst).toHaveLength(1);

    // Repeat call keeps docA and removes its own redundant upload.
    expect(
      await f.repository.materializeScheduleDocument({ scheduleId: imported.id, document: docB }),
    ).toEqual({ dataRevision: 1 });
    expect(await f.repository.getScheduleDocument(imported.id)).toEqual({
      document: docA,
      dataRevision: 1,
    });
    expect(await listFolder(SCHEDULE_DATA_BUCKET, folder)).toEqual(filesAfterFirst);
  });

  it('saves snapshots with revision checks and removes the previous snapshot object (R5, R9)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const metro = f.projectIds['002']!;
    const created = await f.repository.createSchedule({
      projectId: metro,
      name: 'Snapshot Save Test',
      code: 'SS-1',
    });
    const folder = `${f.workspaces.personal}/${metro}/${created.id}`;

    const doc1 = makeSampleScheduleDocument({
      settings: {
        ...makeSampleScheduleDocument().settings,
        statusDate: '2026-10-12T08:00',
        displayMode: 'calculated',
      },
    });
    const doc2 = makeSampleScheduleDocument({
      settings: {
        ...makeSampleScheduleDocument().settings,
        statusDate: '2026-10-22T08:00',
        displayMode: 'calculated',
      },
    });

    await f.repository.acquireScheduleLock(created.id);
    const save1 = await f.repository.saveScheduleDocument({
      scheduleId: created.id,
      expectedRevision: 0,
      document: doc1,
    });
    expect(save1.dataRevision).toBe(1);
    const filesAfterSave1 = await listFolder(SCHEDULE_DATA_BUCKET, folder);
    expect(filesAfterSave1).toHaveLength(1);

    // Stale expectedRevision is rejected and its uploaded object is cleaned up.
    await expect(
      f.repository.saveScheduleDocument({
        scheduleId: created.id,
        expectedRevision: 0,
        document: doc2,
      }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'This schedule was changed elsewhere. Reload and try again.',
    });
    expect(await listFolder(SCHEDULE_DATA_BUCKET, folder)).toEqual(filesAfterSave1);

    // Matching revision succeeds, bumps revision to 2, and removes the rev 1 object.
    const save2 = await f.repository.saveScheduleDocument({
      scheduleId: created.id,
      expectedRevision: 1,
      document: doc2,
    });
    expect(save2.dataRevision).toBe(2);
    expect(save2.schedule).toMatchObject({
      dataRevision: 2,
      hasScheduleData: true,
      statusDate: '2026-10-22',
      activityCount: 2,
      calculationMode: 'calculated',
    });
    expect(await f.repository.getScheduleDocument(created.id)).toEqual({
      document: doc2,
      dataRevision: 2,
    });
    const filesAfterSave2 = await listFolder(SCHEDULE_DATA_BUCKET, folder);
    expect(filesAfterSave2).toHaveLength(1);
    expect(filesAfterSave2[0]).not.toBe(filesAfterSave1[0]);
  });

  it('lets a share recipient read a materialized snapshot under Storage RLS, and forbids locking (V5, R12)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const harborSchedules = await f.repository.listSchedules(f.projectIds['003']!);
    const up02 = harborSchedules.find((s) => s.code === 'UP-02')!;
    const expected = await f.repository.getScheduleDocument(up02.id);
    expect(expected.document).not.toBeNull();
    expect(expected.dataRevision).toBe(1);

    const recipient = await createSignedInUser('Selin', 'Arslan');
    await expect(recipient.repository.getScheduleDocument(up02.id)).rejects.toMatchObject({
      code: 'not_found',
    });

    const { error: shareError } = await admin.from('schedule_shares').insert({
      schedule_id: up02.id,
      shared_by: f.users.current.id,
      shared_with: recipient.userId,
    });
    if (shareError) throw shareError;

    // V5 + R12: share recipient downloads and decodes the exact snapshot under Storage RLS.
    expect(await recipient.repository.getScheduleDocument(up02.id)).toEqual(expected);

    // R3 + R12: share recipient cannot lock or mutate the schedule.
    await expect(recipient.repository.acquireScheduleLock(up02.id)).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      recipient.repository.saveScheduleDocument({
        scheduleId: up02.id,
        expectedRevision: 1,
        document: expected.document!,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('round-trips a 50,000-activity / 150,000-relationship snapshot within 10 MB and 10 s (V6)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const metro = f.projectIds['002']!;
    const big = await f.repository.createSchedule({
      projectId: metro,
      name: 'Large V6 Benchmark',
      code: 'V6-50K',
    });
    const doc = makeLargeScheduleDocument(50_000, 150_000);
    const encoded = await encodeScheduleDocument(doc);
    expect(encoded.size).toBeLessThanOrEqual(10 * 1024 * 1024);

    await f.repository.acquireScheduleLock(big.id);
    const started = Date.now();
    const saved = await f.repository.saveScheduleDocument({
      scheduleId: big.id,
      expectedRevision: 0,
      document: doc,
    });
    const loaded = await f.repository.getScheduleDocument(big.id);
    const elapsedMs = Date.now() - started;

    expect(elapsedMs).toBeLessThan(10_000);
    expect(saved.dataRevision).toBe(1);
    expect(saved.schedule.activityCount).toBe(50_000);
    expect(loaded.dataRevision).toBe(1);
    expect(loaded.document?.activities).toHaveLength(50_000);
    expect(loaded.document?.relationships).toHaveLength(150_000);
  }, 60_000);

  it('removes stored objects from both schedule-imports and schedule-data on deleteSchedules (R9)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const harbor = f.projectIds['003']!;
    const imported = await f.repository.importSchedule(
      await makeImportScheduleInput(harbor, { name: 'Two Bucket Delete', code: 'TBD-1' }),
    );
    await f.repository.materializeScheduleDocument({
      scheduleId: imported.id,
      document: makeSampleScheduleDocument({ sourceFormat: 'xer' }),
    });

    const { data: pathsRow, error: pathsError } = await admin
      .from('schedules')
      .select('source_file_path, data_file_path')
      .eq('id', imported.id)
      .single();
    if (pathsError) throw pathsError;
    const importPath = pathsRow.source_file_path!;
    const dataPath = pathsRow.data_file_path!;

    expect(await objectExists('schedule-imports', importPath)).toBe(true);
    expect(await objectExists(SCHEDULE_DATA_BUCKET, dataPath)).toBe(true);

    await f.repository.deleteSchedules([imported.id]);

    expect(await objectExists('schedule-imports', importPath)).toBe(false);
    expect(await objectExists(SCHEDULE_DATA_BUCKET, dataPath)).toBe(false);
  });
});
