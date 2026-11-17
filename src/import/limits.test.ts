import { describe, expect, it } from 'vitest';
import { utils, write, type WorkSheet } from 'xlsx';
import { analyze, inspect } from '@/import/index';
import { bytesOf, generateCsv, generateXer } from '@/import/testing';
import type { ImportIssue } from '@/data/types';

/** Analyzes through the mapping inspect detects. */
async function analyzed(bytes: Uint8Array, name: string) {
  const inspected = await inspect(bytes, name);
  if (inspected.kind === 'refused') throw new Error(inspected.message);
  const outcome = await analyze(bytes, name, inspected.mapping);
  if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
  return outcome;
}

const errorsIn = (issues: readonly ImportIssue[]) =>
  issues.filter((i) => i.severity === 'error').map((i) => [i.code, i.message]);

async function errors(bytes: Uint8Array, name: string) {
  return errorsIn((await analyzed(bytes, name)).report.issues);
}

describe('limits (§5.10)', () => {
  it.each([
    [
      () => generateXer({ activities: 20001, links: 0 }),
      'a.xer',
      'FILE_TOO_MANY_ACTIVITIES',
      'The file has 20,001 activities. The limit is 20,000.',
    ],
    [
      () => generateXer({ activities: 2, links: 40001 }),
      'b.xer',
      'FILE_TOO_MANY_RELATIONSHIPS',
      'The file has 40,001 relationships. The limit is 40,000.',
    ],
    [
      () => generateXer({ activities: 2, links: 0, wbs: 10001 }),
      'c.xer',
      'FILE_TOO_MANY_WBS',
      'The file has 10,001 WBS elements. The limit is 10,000.',
    ],
    [
      () => generateXer({ activities: 2, links: 0, calendars: 201 }),
      'd.xer',
      'FILE_TOO_MANY_CALENDARS',
      'The file has 201 calendars. The limit is 200.',
    ],
    [
      () => generateCsv({ rows: 20001 }),
      'e.csv',
      'FILE_TOO_MANY_ROWS',
      'The sheet has more than 20,000 rows.',
    ],
    [
      () => generateCsv({ rows: 2, columns: 201 }),
      'f.csv',
      'FILE_TOO_MANY_COLUMNS',
      'The sheet has more than 200 columns.',
    ],
  ])('%#: one past the limit gives its error', async (make, name, code, message) => {
    expect(await errors(make(), name)).toEqual([[code, message]]);
  });
});

describe('calendar names in a table (§5.10, D63)', () => {
  /** A CSV with one row per name in its Calendar column. */
  const withCalendars = (names: readonly string[]) =>
    bytesOf(
      [
        'Activity ID,Activity Name,Calendar',
        ...names.map((name, i) => `A${i + 1},Task ${i + 1},${name}`),
      ]
        .join('\r\n')
        .concat('\r\n'),
    );
  const distinct = (n: number) => Array.from({ length: n }, (_, i) => `Shift ${i + 1}`);

  it('stops a table whose Calendar column holds more than 200 different names', async () => {
    expect(await errors(withCalendars(distinct(201)), 'g.csv')).toEqual([
      [
        'TABLE_TOO_MANY_CALENDARS',
        'The Calendar column holds 201 different names. The limit is 200.',
      ],
    ]);
  });

  it('counts the names as the reader makes calendars of them', async () => {
    expect(await errors(withCalendars(distinct(200)), 'h.csv')).toEqual([]);
    // Names folding to the same text are one calendar; one folding to "standard" is Standard.
    const repeated = [...distinct(200), 'STANDARD', ' standard', 'SHIFT 1', 'shift 2', 'Shıft 3'];
    expect(await errors(withCalendars(repeated), 'i.csv')).toEqual([]);
  });
});

// D65: xlsx sheets are read through a 100,000-row window, blank rows included; more than 20,000
// data rows, or a sheet whose range runs past the window, gives FILE_TOO_MANY_ROWS.
describe('the xlsx read window (§5.7, §5.10, D65)', () => {
  const ROWS = ['FILE_TOO_MANY_ROWS', 'The sheet has more than 20,000 rows.'];
  const workbookOf = (sheet: WorkSheet) => {
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, 'Plan');
    return new Uint8Array(write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
  };
  /** `n` activities under a header row, with a blank row after every `blankEvery` of them. */
  const activityRows = (n: number, blankEvery = 0) => {
    const rows: string[][] = [['Activity ID', 'Activity Name']];
    for (let i = 1; i <= n; i += 1) {
      rows.push([`A${i}`, `Activity ${i}`]);
      if (blankEvery > 0 && i % blankEvery === 0) rows.push([]);
    }
    return rows;
  };

  it('reads 20,000 activities with a blank row after every 100, about 20,200 sheet rows', async () => {
    const bytes = workbookOf(utils.aoa_to_sheet(activityRows(20000, 100)));
    const { report, model } = await analyzed(bytes, 'blank-rows.xlsx');
    expect(errorsIn(report.issues)).toEqual([]);
    expect(model.activities).toHaveLength(20000);
    expect(model.activities.at(-1)?.code).toBe('A20000');
  });

  it('gives FILE_TOO_MANY_ROWS for 20,001 data rows with blank rows between them', async () => {
    const bytes = workbookOf(utils.aoa_to_sheet(activityRows(20001, 100)));
    expect(await errors(bytes, 'too-many.xlsx')).toEqual([ROWS]);
  });

  it('reads a sheet to its row 100,000, the last row of the window', async () => {
    const sheet = utils.aoa_to_sheet(activityRows(2));
    utils.sheet_add_aoa(sheet, [['A3', 'Activity 3']], { origin: 'A100000' });
    const { report, model } = await analyzed(workbookOf(sheet), 'last-row.xlsx');
    expect(errorsIn(report.issues)).toEqual([]);
    expect(model.activities.map((a) => a.code)).toEqual(['A1', 'A2', 'A3']);
  });

  it.each([
    [
      'a row past the window',
      () => {
        const sheet = utils.aoa_to_sheet(activityRows(2));
        utils.sheet_add_aoa(sheet, [['A3', 'Activity 3']], { origin: 'A100001' });
        return sheet;
      },
    ],
    [
      'a range past the window without a value there',
      () => ({ ...utils.aoa_to_sheet(activityRows(2)), '!ref': 'A1:B100001' }),
    ],
  ])('gives FILE_TOO_MANY_ROWS for a sheet with %s', async (_, make) => {
    expect(await errors(workbookOf(make()), 'long.xlsx')).toEqual([ROWS]);
  });
});

// D69: only the first 201 columns of a sheet are kept; a row reaching past them is too wide, as a
// row of 201 filled columns is.
describe('the xlsx column window (§5.7, §5.10, D69)', () => {
  it('gives FILE_TOO_MANY_COLUMNS, and nothing else, for a sheet with cells in its last column', async () => {
    // A two-column table of 1,999 activities with "x" in XFD1 to XFD2000, the sheet's last column.
    // The sheet is built dense: SheetJS writes one this wide ten times faster that way.
    const rows = [['Activity ID', 'Activity Name']];
    for (let i = 1; i < 2000; i += 1) rows.push([`A${i}`, `Activity ${i}`]);
    const sheet = utils.aoa_to_sheet(rows, { dense: true });
    utils.sheet_add_aoa(
      sheet,
      Array.from({ length: 2000 }, () => ['x']),
      { origin: 'XFD1' },
    );
    const book = utils.book_new();
    utils.book_append_sheet(book, sheet, 'Plan');
    const bytes = new Uint8Array(write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(await errors(bytes, 'wide.xlsx')).toEqual([
      ['FILE_TOO_MANY_COLUMNS', 'The sheet has more than 200 columns.'],
    ]);
  }, 30_000);
});
