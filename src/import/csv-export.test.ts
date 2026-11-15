import { describe, expect, it } from 'vitest';
import { reportFileName, reportToCsv } from '@/import/csv-export';
import type { ImportReport } from '@/data/types';

const issue = (message: string, original: string | null = null) =>
  ({
    severity: 'warning',
    code: 'TABLE_BAD_NUMBER',
    message,
    location: 'Line 2',
    original,
    used: null,
  }) as const;

describe('report CSV', () => {
  it('quotes every cell and defuses formula starts, full-width forms included', () => {
    const report = {
      issues: [issue('Plain "quoted"'), issue('=1+1', '＋SUM(A1)'), issue('@cmd', '\tx')],
    } as unknown as ImportReport;
    expect(reportToCsv(report).split('\r\n')).toEqual([
      '"severity","code","message","location","original","used"',
      '"warning","TABLE_BAD_NUMBER","Plain ""quoted""","Line 2","",""',
      '"warning","TABLE_BAD_NUMBER","\'=1+1","Line 2","\'＋SUM(A1)",""',
      '"warning","TABLE_BAD_NUMBER","\'@cmd","Line 2","\'\tx",""',
    ]);
  });

  it('names the downloads after the schedule', () => {
    expect(reportFileName('North Plant', 'csv')).toBe('North Plant - import report.csv');
    expect(reportFileName('North Plant', 'json')).toBe('North Plant - import report.json');
  });
});
