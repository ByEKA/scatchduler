import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import type { ImportIssue } from '@/data/types';
import type { Database } from '@/data/supabase/database.types';
import { SupabaseRepository } from '@/data/supabase/SupabaseRepository';
import { generateXer } from '@/import/testing';
import { makeImportScheduleInput } from '@/test/fakes';
import { readLocalStack } from './local-stack';
import { makeSupabaseRepositoryFixture, signedInClient } from './supabase-fixture';

const stack = readLocalStack();
const admin = createClient<Database>(stack.apiUrl, stack.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pathOf = async (id: string) =>
  (await admin.from('schedules').select('source_file_path').eq('id', id).single()).data!
    .source_file_path!;
const bytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

describe('imports on the local stack', () => {
  it('stores a gzipped XER and an xlsx as it is, and gives both originals back', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const xer = await makeImportScheduleInput(f.projectIds['002']!);
    const xlsx = await makeImportScheduleInput(f.projectIds['002']!, {
      fixture: 'dates-1900.xlsx',
    });
    const [a, b] = [
      await f.repository.importSchedule(xer),
      await f.repository.importSchedule(xlsx),
    ];
    expect(await pathOf(a.id)).toMatch(/\.xer\.gz$/);
    expect(await pathOf(b.id)).toMatch(/[0-9a-f-]{36}\.xlsx$/);
    expect(await bytes(await f.repository.getScheduleSourceFile(a.id))).toEqual(
      await bytes(xer.file),
    );
    expect(await bytes(await f.repository.getScheduleSourceFile(b.id))).toEqual(
      await bytes(xlsx.file),
    );

    // Task 10: import immediately writes the initial ScheduleDocument snapshot to schedule-data.
    expect(a).toMatchObject({
      hasScheduleData: true,
      dataRevision: 1,
      calculationMode: 'as_imported',
    });
    const { data: row } = await admin
      .from('schedules')
      .select('data_file_path')
      .eq('id', a.id)
      .single();
    const dataPath = row!.data_file_path!;
    expect(dataPath).toMatch(
      new RegExp(
        `^${f.workspaces.personal}/${f.projectIds['002']}/${a.id}/[0-9a-f-]{36}\\.json\\.gz$`,
      ),
    );
    expect((await admin.storage.from('schedule-data').download(dataPath)).error).toBeNull();
    const loaded = await f.repository.getScheduleDocument(a.id);
    expect(loaded.dataRevision).toBe(1);
    expect(loaded.document?.activities).toHaveLength(6);
    expect(loaded.document?.activities[0]?.code).toBe('A1000');

    await f.repository.setCurrentSchedule(b.id);
    await f.repository.deleteSchedules([a.id]);
    expect((await admin.storage.from('schedule-data').download(dataPath)).error).not.toBeNull();
  });

  it('stores a report near 200 KB of Turkish text within the 256 KB column check', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const input = await makeImportScheduleInput(f.projectIds['002']!);
    const long = (i: number): ImportIssue => ({
      severity: 'warning',
      code: 'TABLE_BAD_NUMBER',
      message: `${'Şantiye işçiliği ğüşıöç '.repeat(8).slice(0, 199)}…`,
      location: `Line ${i}`,
      original: 'İ'.repeat(200),
      used: 'ş'.repeat(200),
    });
    const { pack } = await import('@/import/index');
    const report = (
      await pack(new Uint8Array(await input.file.arrayBuffer()), input.file.name, {
        ...input.report,
        issues: Array.from({ length: 500 }, (_, i) => long(i)),
      })
    ).report;
    expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeGreaterThan(150_000);
    const schedule = await f.repository.importSchedule({ ...input, report });
    expect((await f.repository.getImportReport(schedule.id))!.issues).toHaveLength(
      report.issues.length,
    );
  });

  it('keeps a P2-era import readable: no report or mapping, and its uncompressed original', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const metro = f.projectIds['002']!;
    const path = `${f.workspaces.personal}/${metro}/${crypto.randomUUID()}.xer`;
    await admin.storage.from('schedule-imports').upload(path, new Blob(['ERMHDR\t8.0']));
    const { data } = await admin
      .from('schedules')
      .insert({
        project_id: metro,
        name: 'P2 era',
        source: 'import',
        source_format: 'xer',
        source_file_name: 'old.xer',
        source_file_path: path,
      })
      .select('id')
      .single();
    expect(await f.repository.getImportReport(data!.id)).toBeNull();
    expect(await f.repository.getImportMapping(data!.id)).toBeNull();
    const file = await f.repository.getScheduleSourceFile(data!.id);
    expect([file.name, new TextDecoder().decode(await bytes(file))]).toEqual([
      'old.xer',
      'ERMHDR\t8.0',
    ]);
  });

  it('lets a viewer read the report and the mapping', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const schedule = await f.repository.importSchedule(
      await makeImportScheduleInput(f.projectIds['T-01']!, { code: 'NTH-T' }),
    );
    const viewer = new SupabaseRepository(
      await signedInClient(f.users.elif!.email, 'letters12345'),
    );
    expect(await viewer.getImportReport(schedule.id)).toMatchObject({ format: 'xer' });
    expect(await viewer.getImportMapping(schedule.id)).toMatchObject({ sourceProjectId: '101' });
  });

  it('imports a generated 50 MB XER within the client timeout (S5, V8, D67)', async () => {
    const f = await makeSupabaseRepositoryFixture();
    const xerBytes = generateXer({
      activities: 2000,
      links: 2000,
      padToBytes: 50 * 1024 * 1024 - 4096,
    });
    expect(xerBytes.length).toBeLessThanOrEqual(52428800);
    const input = await makeImportScheduleInput(f.projectIds['002']!, {
      file: new File([xerBytes.slice()], 'big.xer'),
      name: 'Big',
      code: 'BIG',
    });
    expect(input.stored.size).toBeLessThanOrEqual(10 * 1024 * 1024);
    const started = Date.now();
    await f.repository.importSchedule(input);
    expect(Date.now() - started).toBeLessThan(60_000);
  }, 120_000);
});
