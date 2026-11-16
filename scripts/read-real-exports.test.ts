// @vitest-environment node
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readExportShapes, readExports } from './read-real-exports';

describe('read-real-exports', () => {
  it('shows what the files are made of: field names, type codes and masked value forms (D66)', async () => {
    const text = await readExportShapes('src/import/__fixtures__');
    expect(text).toContain('XER 20.12: 1 files');
    expect(text).toContain("TASKPRED: in 1 files; reader's fields missing: none");
    expect(text).toContain("PROJECT: in 1 files; reader's fields missing: data_date ×1");
    expect(text).toContain('pred_type: PR_FS');
    expect(text).toContain('task_type: TT_Task');
    expect(text).toContain('dates: 9-9-9 9:9');
    expect(text).toContain('calendars: 3 read (0 repaired), 0 unreadable');
    expect(text).toMatch(/row 1: 8 cells, 8 distinct, 8 name a field/);
    for (const secret of [
      'Mobilisation',
      'A1000',
      'NTH-A',
      'Standard 5 Day',
      'Kazı',
      'two-projects',
    ])
      expect(text).not.toContain(secret);
    await expect(readExportShapes('does/not/exist')).rejects.toThrow(
      'No exports found in does/not/exist',
    );
  });

  it('reports formats, versions, counts, issue codes and check findings without names or codes', async () => {
    const text = await readExports('src/import/__fixtures__');
    expect(text).toContain('xer 20.12');
    expect(text).toMatch(/activities\s+6\s+6\s+1\s+0/);
    expect(text).toContain('XER_CROSS_PROJECT_LINK');
    expect(text).toContain('external_links');
    for (const secret of [
      'Mobilisation',
      'A1000',
      'Kazı',
      'Şantiye',
      'T100',
      'two-projects',
      'Depot Upgrade',
    ])
      expect(text).not.toContain(secret);
  });

  it('stops with an error naming a missing or empty folder', async () => {
    await expect(readExports('does/not/exist')).rejects.toThrow(
      'No exports found in does/not/exist',
    );
  });

  it('reads the files of subfolders and shows table tokens with refs and digits masked (D66)', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'real-exports-'));
    try {
      mkdirSync(join(folder, 'a', 'b'), { recursive: true });
      copyFileSync('src/import/__fixtures__/turkish-1254.csv', join(folder, 'a', 'b', 'plan.csv'));
      copyFileSync('src/import/__fixtures__/project.xml', join(folder, 'a', 'depot.xml'));
      const text = await readExports(folder);
      expect(text).toContain('File 1: csv');
      expect(text).toContain('File 2: mspdi 14');
      expect(text).toContain('windows-1254');
      expect(text).toContain('REFSS+9 g');
      expect(text).toContain('99.99.9999');
      for (const secret of ['T110', 'plan.csv', 'depot', 'Gündüz', 'İskele'])
        expect(text).not.toContain(secret);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
