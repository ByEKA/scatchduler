import { describe, expect, it, vi } from 'vitest';
import xer from '@/import/__fixtures__/two-projects.xer?bytes';
import turkish from '@/import/__fixtures__/turkish-1254.csv?bytes';
import mspdi from '@/import/__fixtures__/project.xml?bytes';
import titleRows from '@/import/__fixtures__/title-rows.xlsx?bytes';
import { GOLDEN_CASES } from '@/import/__fixtures__/cases';
import { analyze, inspect, preview } from '@/import/index';
import type * as reportModule from '@/import/report';
import { bytesOf, concatBytes, mspdiXml } from '@/import/testing';
import type { ImportIssue, ImportMapping } from '@/data/types';

describe('inspect and analyze', () => {
  it('inspects each kind of file: projects, code fields, decoded names and a table preview', async () => {
    expect(await inspect(xer, 'north.xer')).toMatchObject({
      kind: 'schedule',
      format: 'xer',
      size: xer.length,
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      projects: [
        { code: 'NTH-A', exportFlag: true },
        { code: 'NTH-B', exportFlag: false },
      ],
      firstActivities: [
        'Mobilisation',
        'Kazı işleri',
        'Foundations',
        'Pump install',
        'Commissioning',
      ],
      mapping: {
        schemaVersion: 1,
        format: 'xer',
        encoding: 'utf-8',
        sourceProjectId: '101',
        activityCodeField: null,
        table: null,
      },
    });
    expect(await inspect(mspdi, 'depot.xml')).toMatchObject({
      kind: 'schedule',
      format: 'mspdi',
      codeFields: ['UID', 'ID'],
      mapping: { activityCodeField: 'UID' },
    });
    expect(await inspect(turkish, 'liste.csv')).toMatchObject({
      kind: 'table',
      format: 'csv',
      sheets: [],
      encoding: { name: 'windows-1254', detectedBy: 'byte-score' },
      mapping: { encoding: 'windows-1254', table: { delimiter: ';', decimalSeparator: ',' } },
      preview: { headers: expect.arrayContaining(['Aktivite Adı']) },
    });
  });

  it('refuses with the detection message and never throws', async () => {
    expect(await inspect(bytesOf('SQLite format 3\0'), 'x.xer')).toEqual({
      kind: 'refused',
      fileName: 'x.xer',
      size: 16,
      parserVersion: '1.1.0',
      message:
        'This is a database file, not a schedule export. Export the project as XER from P6 or as XML from Microsoft Project.',
    });
  });

  it('reads an XER named .csv as XER and says so', async () => {
    const outcome = await analyze(xer, 'north.csv', {
      schemaVersion: 1,
      format: 'xer',
      encoding: 'utf-8',
      sourceProjectId: '101',
      activityCodeField: null,
      table: null,
    });
    expect(
      outcome.kind === 'analyzed' &&
        outcome.report.issues.find((i) => i.code === 'FORMAT_FROM_CONTENT')!.message,
    ).toBe(
      "The file's name ends in .csv, but it holds Primavera P6 XER. It was read as Primavera P6 XER.",
    );
  });
});

// Hand-offs from the reader tasks (decisions D52 and D56).
describe('inspect and analyze: reader hand-offs', () => {
  it('notes Microsoft Project XML whose root has no namespace (D52)', async () => {
    const tasks =
      '<Task><UID>1</UID><ID>1</ID><Name>Only task</Name><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber>' +
      '<Start>2026-03-02T08:00:00</Start><Finish>2026-03-02T17:00:00</Finish><Duration>PT8H0M0S</Duration></Task>';
    const xml = mspdiXml({ tasks });
    const mapping = {
      schemaVersion: 1,
      format: 'mspdi',
      encoding: null,
      sourceProjectId: null,
      activityCodeField: 'UID',
      table: null,
    } as const;
    const notes = async (text: string) => {
      const outcome = await analyze(bytesOf(text), 'plan.xml', mapping);
      if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
      return outcome.report.issues.filter((i) => i.code === 'MSPDI_NO_NAMESPACE');
    };
    expect(await notes(xml.replace(' xmlns="http://schemas.microsoft.com/project"', ''))).toEqual([
      {
        severity: 'info',
        code: 'MSPDI_NO_NAMESPACE',
        message:
          'The file has no Microsoft Project namespace. It was read as Microsoft Project XML.',
        location: null,
        original: null,
        used: null,
      },
    ]);
    expect(await notes(xml)).toEqual([]);
  });

  it('never chooses a baseline project by default (D56)', async () => {
    const chosen = async (projects: string[][]) => {
      const text = [
        'ERMHDR\t20.12\t2026-11-01\tProject\tadmin\tPlanner\tdbxDatabaseNoName\tProject Management\tUSD',
        '%T\tPROJECT',
        '%F\tproj_id\tproj_short_name\texport_flag\tsum_base_proj_id',
        ...projects.map((fields) => `%R\t${fields.join('\t')}`),
        '%E',
      ].join('\r\n');
      const outcome = await inspect(bytesOf(text), 'plan.xer');
      if (outcome.kind !== 'schedule') throw new Error(outcome.kind);
      return outcome.mapping.sourceProjectId;
    };
    // A flagged baseline is passed over for the first flagged project that isn't one.
    expect(
      await chosen([
        ['1', 'BL', 'Y', ''],
        ['2', 'CUR', 'N', '1'],
        ['3', 'ALT', 'Y', ''],
      ]),
    ).toBe('3');
    // No flagged project that isn't a baseline: the first project that isn't one.
    expect(
      await chosen([
        ['1', 'BL', 'Y', ''],
        ['2', 'CUR', 'N', '1'],
      ]),
    ).toBe('2');
    // Only baselines: the first project.
    expect(
      await chosen([
        ['1', 'A', 'Y', '2'],
        ['2', 'B', 'N', '1'],
      ]),
    ).toBe('1');
  });

  it("names the first activities of the project it chooses, not a baseline's (D56)", async () => {
    const text = [
      'ERMHDR\t20.12\t2026-11-01\tProject\tadmin\tPlanner\tdbxDatabaseNoName\tProject Management\tUSD',
      '%T\tPROJECT',
      '%F\tproj_id\tproj_short_name\texport_flag\tsum_base_proj_id',
      '%R\t1\tBL\tY\t',
      '%R\t2\tCUR\tY\t1',
      '%T\tTASK',
      '%F\ttask_id\tproj_id\ttask_code\ttask_name',
      '%R\t10\t1\tB1\tBaseline task',
      '%R\t20\t2\tC1\tCurrent task',
      '%R\t21\t2\tC2\tSecond task',
      '%E',
    ].join('\r\n');
    expect(await inspect(bytesOf(text), 'plan.xer')).toMatchObject({
      kind: 'schedule',
      mapping: { sourceProjectId: '2' },
      firstActivities: ['Current task', 'Second task'],
    });
  });
});

const caseMapping = (name: string) => GOLDEN_CASES.find((c) => c.name === name)!.mapping;
const xerMapping = caseMapping('two-projects.NTH-A');
const turkishMapping = caseMapping('turkish-1254');

async function inspected(bytes: Uint8Array, name: string) {
  const outcome = await inspect(bytes, name);
  if (outcome.kind === 'refused') throw new Error(outcome.message);
  return outcome;
}

/** Analyzes through `mapping`, or the mapping inspect detects. */
async function analyzed(bytes: Uint8Array, name: string, mapping?: ImportMapping) {
  const outcome = await analyze(bytes, name, mapping ?? (await inspected(bytes, name)).mapping);
  if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
  return outcome;
}

const encodingNotes = (issues: readonly ImportIssue[]) =>
  issues.filter((i) => i.code.startsWith('ENCODING_')).map((i) => [i.code, i.message]);
const invalidBytes = (n: number) => [
  'ENCODING_INVALID_BYTES',
  `${n} bytes aren't valid UTF-8 and were replaced with �. If letters look wrong, choose another encoding.`,
];

describe('inspect: the mapping a golden case writes out', () => {
  it('detects the title-rows mapping from the workbook itself (D69)', async () => {
    // The merged titles fill their rows, the header row is guessed below them, and the lag
    // "1,5 g" decides the decimal separator.
    expect((await inspected(titleRows, 'title-rows.xlsx')).mapping).toEqual(
      caseMapping('title-rows'),
    );
  });
});

// §5.4 and §5.8: the user overrides any encoding a byte-order mark didn't set, and P4 reads the
// stored mapping's encoding.
describe('analyze and preview: the encoding the user chose', () => {
  it('decodes a CSV and an XER with the mapping encoding and says the user chose it', async () => {
    const csv = await analyzed(turkish, 'liste.csv', {
      ...turkishMapping,
      encoding: 'windows-1252',
    });
    expect(csv.report.encoding).toEqual({ name: 'windows-1252', detectedBy: 'user' });
    expect(encodingNotes(csv.report.issues)).toEqual([]);
    expect(csv.model.activities.map((a) => a.name)).toContain('Kazý iþleri');

    const p6 = await analyzed(xer, 'north.xer', { ...xerMapping, encoding: 'windows-1254' });
    expect(p6.report.encoding).toEqual({ name: 'windows-1254', detectedBy: 'user' });
    expect(encodingNotes(p6.report.issues)).toEqual([]);
    expect(p6.model.activities.map((a) => a.name)).toContain('KazÄ± iÅŸleri');
  });

  it('keeps the byte-order mark over the encoding the mapping or the preview names', async () => {
    const bytes = bytesOf('\uFEFFActivity ID,Activity Name\nT1,Kazı işleri\n');
    const { mapping } = await inspected(bytes, 'bom.csv');
    const detected = await analyzed(bytes, 'bom.csv', mapping);
    const chosen = await analyzed(bytes, 'bom.csv', { ...mapping, encoding: 'windows-1254' });
    expect(detected.report.encoding).toEqual({ name: 'utf-8', detectedBy: 'bom' });
    expect(chosen.report.encoding).toEqual({ name: 'utf-8', detectedBy: 'bom' });
    expect(chosen.model.activities.map((a) => a.name)).toEqual(['Kazı işleri']);
    expect(chosen.model).toEqual(detected.model);
    expect(preview(bytes, 'bom.csv', mapping.table!, 'windows-1254')).toMatchObject({
      headers: ['Activity ID', 'Activity Name'],
      rows: [{ cells: [{ text: 'T1' }, { text: 'Kazı işleri' }] }],
    });
  });

  it('previews a CSV with the encoding the Columns step names', () => {
    const table = turkishMapping.table!;
    expect(preview(turkish, 'liste.csv', table, 'windows-1252').headers).toContain('Aktivite Adý');
    expect(preview(turkish, 'liste.csv', table, 'windows-1254').headers).toContain('Aktivite Adı');
    expect(preview(turkish, 'liste.csv', table, null).headers).toContain('Aktivite Adı');
  });

  it('notes the bytes that mostly valid UTF-8 replaces', async () => {
    const bytes = concatBytes(
      bytesOf(`Activity ID,Activity Name\nT1,${'ş'.repeat(100)}\nT2,Kaz`),
      [0xfd],
      bytesOf('\n'),
    );
    const { report } = await analyzed(bytes, 'mostly.csv');
    expect(report.encoding).toEqual({ name: 'utf-8', detectedBy: 'utf8' });
    expect(encodingNotes(report.issues)).toEqual([invalidBytes(1)]);
  });

  it('notes the bytes UTF-8 replaces when the user chose UTF-8', async () => {
    const { report, model } = await analyzed(turkish, 'liste.csv', {
      ...turkishMapping,
      encoding: 'utf-8',
    });
    expect(report.encoding).toEqual({ name: 'utf-8', detectedBy: 'user' });
    expect(encodingNotes(report.issues)).toEqual([invalidBytes(17)]);
    expect(model.activities.map((a) => a.name)).toContain('Kaz� i�leri');
  });
});

// analyze's own errors (§5.2, §5.12).
describe('analyze: file-level errors', () => {
  const errorsOf = async (bytes: Uint8Array, name: string) =>
    (await analyzed(bytes, name)).report.issues
      .filter((i) => i.severity === 'error')
      .map((i) => [i.code, i.message]);
  const xerText = (...lines: string[]) =>
    [
      'ERMHDR\t20.12\t2026-11-01\tProject\tadmin\tPlanner\tdbxDatabaseNoName\tProject Management\tUSD',
      ...lines,
    ].join('\r\n');
  const EMPTY = ['FILE_EMPTY', 'The file is empty.'];
  const NO_ACTIVITIES = ['FILE_NO_ACTIVITIES', 'No activities were found in this file.'];
  const UNREADABLE = [
    'FILE_UNREADABLE',
    "This file couldn't be read. It may be damaged or incomplete. Export it again from your planning tool and retry.",
  ];

  it('gives FILE_EMPTY for an empty file and for one holding only a byte-order mark', async () => {
    expect(await errorsOf(new Uint8Array(0), 'empty.csv')).toEqual([EMPTY]);
    expect(await errorsOf(new Uint8Array([0xef, 0xbb, 0xbf]), 'bom.csv')).toEqual([EMPTY]);
  });

  it('gives FILE_NO_ACTIVITIES when no activity is accepted', async () => {
    const header = bytesOf('Activity ID,Activity Name\r\n');
    expect(await errorsOf(header, 'header.csv')).toEqual([NO_ACTIVITIES]);
    const noTasks = xerText('%T\tPROJECT', '%F\tproj_id\tproj_short_name', '%R\t1\tEMPTY', '%E');
    expect(await errorsOf(bytesOf(noTasks), 'empty.xer')).toEqual([NO_ACTIVITIES]);
  });

  it('gives FILE_UNREADABLE alone for an XER with a record before its fields', async () => {
    const broken = xerText('%T\tPROJECT', '%R\t1\tBROKEN', '%F\tproj_id\tproj_short_name', '%E');
    expect(await errorsOf(bytesOf(broken), 'broken.xer')).toEqual([UNREADABLE]);
  });
});

describe('analyze: durationMs', () => {
  it('covers the read, the checks and the report', async () => {
    let now = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.resetModules();
    vi.doMock('@/import/report', async (importOriginal) => {
      const original = await importOriginal<typeof reportModule>();
      return {
        ...original,
        buildReport: (...args: Parameters<typeof original.buildReport>) => {
          now += 40; // the report takes 40 ms
          return original.buildReport(...args);
        },
      };
    });
    try {
      const fresh = await import('@/import/index');
      const outcome = await fresh.analyze(xer, 'north.xer', xerMapping);
      expect(outcome.kind === 'analyzed' && outcome.report.durationMs).toBe(40);
    } finally {
      vi.doUnmock('@/import/report');
      vi.resetModules();
      clock.mockRestore();
    }
  });
});
