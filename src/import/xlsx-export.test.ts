import { describe, expect, it } from 'vitest';
import { read, utils, type CellObject } from 'xlsx';
import type { ImportReport } from '@/data/types';
import { reportFileName } from '@/import/csv-export';
import { reportToXlsx } from '@/import/xlsx-export';

const sampleReport: ImportReport = {
  schemaVersion: 1,
  parserVersion: '1.0.0',
  format: 'xer',
  formatVersion: '19.12',
  file: { name: '=evil.xer', size: 2048, sha256: 'abc123' },
  formatFromContent: false,
  activityCodeField: null,
  sourceProject: {
    id: '101',
    code: 'NTH',
    name: 'North Plant',
    projectsInFile: 1,
    rootWbsName: 'North Plant',
    mustFinishBy: null,
    stated: { start: '2026-10-01', finish: '2026-10-20' },
  },
  encoding: { name: 'utf-8', detectedBy: 'utf8' },
  table: null,
  statusDate: { date: '2026-10-05', time: '08:00', source: 'file' },
  dateRange: { start: '2026-10-05', finish: '2026-10-20' },
  units: { minutesPerDay: 480, calendars: [{ name: 'Standard', hoursPerDay: 8 }] },
  settings: [],
  counts: [
    { entity: 'calendar', read: 1, accepted: 1, adjusted: 0, skipped: 0 },
    { entity: 'wbs', read: 2, accepted: 2, adjusted: 0, skipped: 0 },
    { entity: 'activity', read: 6, accepted: 6, adjusted: 1, skipped: 0 },
    { entity: 'relationship', read: 5, accepted: 5, adjusted: 0, skipped: 0 },
  ],
  breakdown: {
    activitiesByType: [{ type: 'task', count: 6 }],
    activitiesStarted: 1,
    activitiesCompleted: 1,
    relationshipsByType: [{ type: 'FS', count: 5 }],
    constraints: 0,
    calendarExceptions: 0,
  },
  outcomes: [],
  checks: [
    { id: 'actual_after_status_date', findings: 1 },
    { id: 'external_links', findings: 0 },
  ],
  externalLinks: [],
  notImported: [],
  issueTotals: { error: 0, warning: 2, info: 1 },
  issues: [
    {
      severity: 'warning',
      code: 'TABLE_BAD_NUMBER',
      message: '=1+1',
      location: '+Sheet1!A2',
      original: '＋SUM(A1)',
      used: '@cmd',
    },
    {
      severity: 'info',
      code: 'STATUS_DATE_FALLBACK',
      message: '-fallback',
      location: '\tLine 4',
      original: null,
      used: '2026-10-05',
    },
  ],
  durationMs: 12,
};

describe('reportToXlsx', () => {
  it('writes a 4-sheet workbook (Summary, Counts, Checks, Issues) and defuses formula injection', () => {
    const bytes = reportToXlsx(sampleReport, '=North Plant');
    expect(bytes.byteLength).toBeGreaterThan(100);

    const wb = read(bytes, { type: 'array', cellFormula: true });
    expect(wb.SheetNames).toEqual(['Summary', 'Counts', 'Checks', 'Issues']);

    // Verify no cell in any worksheet has a formula (`cell.f`)
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]!;
      for (const [key, value] of Object.entries(sheet)) {
        if (key.startsWith('!')) continue;
        const cell = value as CellObject;
        expect(cell.f, `${sheetName}!${key} formula`).toBeUndefined();
      }
    }

    const summaryRows = utils.sheet_to_json<string[]>(wb.Sheets['Summary']!, { header: 1 });
    expect(summaryRows).toContainEqual(['Schedule', "'=North Plant"]);
    expect(summaryRows).toContainEqual(['File', "'=evil.xer"]);

    const countsRows = utils.sheet_to_json<Array<string | number>>(wb.Sheets['Counts']!, {
      header: 1,
    });
    expect(countsRows[0]).toEqual(['Entity', 'Read', 'Accepted', 'Adjusted', 'Skipped']);
    expect(countsRows).toContainEqual(['activity', 6, 6, 1, 0]);

    const checksRows = utils.sheet_to_json<Array<string | number>>(wb.Sheets['Checks']!, {
      header: 1,
    });
    expect(checksRows).toContainEqual(['actual_after_status_date', 1]);

    const issuesRows = utils.sheet_to_json<string[]>(wb.Sheets['Issues']!, { header: 1 });
    expect(issuesRows[0]).toEqual(['Severity', 'Code', 'Message', 'Location', 'Original', 'Used']);
    expect(issuesRows[1]).toEqual([
      'warning',
      'TABLE_BAD_NUMBER',
      "'=1+1",
      "'+Sheet1!A2",
      "'＋SUM(A1)",
      "'@cmd",
    ]);
    expect(issuesRows[2]).toEqual([
      'info',
      'STATUS_DATE_FALLBACK',
      "'-fallback",
      "'\tLine 4",
      '',
      '2026-10-05',
    ]);

    expect(reportFileName('North Plant', 'xlsx')).toBe('North Plant - import report.xlsx');
  });
});
