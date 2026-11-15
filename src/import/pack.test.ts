import { gunzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import xer from '@/import/__fixtures__/two-projects.xer?bytes';
import workbook from '@/import/__fixtures__/dates-1900.xlsx?bytes';
import { analyze, inspect, pack } from '@/import/index';
import type { ImportIssue, ImportReport } from '@/data/types';

async function reportOf(bytes: Uint8Array, name: string): Promise<ImportReport> {
  const inspected = await inspect(bytes, name);
  if (inspected.kind === 'refused') throw new Error(inspected.message);
  const outcome = await analyze(bytes, name, inspected.mapping);
  if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
  return outcome.report;
}

describe('pack', () => {
  it('gzips text formats and keeps an xlsx as it is', async () => {
    const packed = await pack(xer, 'north.xer', await reportOf(xer, 'north.xer'));
    expect(gunzipSync(packed.stored)).toEqual(xer);
    expect(
      (await pack(workbook, 'plan.xlsx', await reportOf(workbook, 'plan.xlsx'))).stored,
    ).toEqual(workbook);
  });

  it('keeps 500 issues, then drops notes and warnings to stay within 200 KB', async () => {
    const report = await reportOf(xer, 'north.xer');
    const long = (severity: 'warning' | 'info', i: number): ImportIssue => ({
      severity,
      code: severity === 'info' ? 'TEXT_TRUNCATED' : 'TABLE_BAD_NUMBER',
      message: `${'Şantiye işçiliği ğüşıöç '.repeat(8).slice(0, 199)}…`,
      location: `Line ${i}`,
      original: 'İ'.repeat(200),
      used: 'ş'.repeat(200),
    });
    const big = {
      ...report,
      issues: [
        ...Array.from({ length: 300 }, (_, i) => long('warning', i)),
        ...Array.from({ length: 300 }, (_, i) => long('info', i)),
      ],
    };
    const stored = (await pack(xer, 'north.xer', big)).report;
    expect(new TextEncoder().encode(JSON.stringify(stored)).length).toBeLessThanOrEqual(204800);
    expect(stored.issues.length).toBeLessThan(500);
    expect(stored.issues.slice(0, 10).every((i) => i.severity === 'warning')).toBe(true);
    expect(stored.issueTotals).toEqual(big.issueTotals);
  });

  it('refuses a report with errors', async () => {
    const report = await reportOf(xer, 'north.xer');
    const withError = {
      ...report,
      issues: [
        {
          severity: 'error',
          code: 'FILE_EMPTY',
          message: 'The file is empty.',
          location: null,
          original: null,
          used: null,
        } as const,
      ],
    };
    await expect(pack(xer, 'north.xer', withError)).rejects.toThrow();
  });
});
