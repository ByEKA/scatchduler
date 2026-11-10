import { describe, expect, it } from 'vitest';
import { ISSUE_CATALOG, makeIssue } from '@/import/issues';

describe('issue catalog', () => {
  it('holds the 64 codes of spec §5.12 with their severities', () => {
    const entries = Object.values(ISSUE_CATALOG);
    expect(entries).toHaveLength(64);
    expect(
      (['error', 'warning', 'info'] as const).map(
        (s) => entries.filter((e) => e.severity === s).length,
      ),
    ).toEqual([13, 34, 17]);
    expect(ISSUE_CATALOG.DUPLICATE_CODE).toEqual({
      severity: 'error',
      group: 'Repeated activity codes',
      message: 'Activity code {code} is used more than once.',
    });
    expect(ISSUE_CATALOG.CALENDAR_GENERATED_STANDARD.group).toBe('Generated calendars');
  });

  it('fills the message and formats counts', () => {
    expect(makeIssue('FILE_TOO_MANY_ACTIVITIES', { n: 20001 })).toEqual({
      severity: 'error',
      code: 'FILE_TOO_MANY_ACTIVITIES',
      message: 'The file has 20,001 activities. The limit is 20,000.',
      location: null,
      original: null,
      used: null,
    });
    expect(
      makeIssue(
        'TABLE_BAD_DATE',
        { value: '31.02.2026', format: 'DD.MM.YYYY' },
        { location: 'Line 12', original: '31.02.2026' },
      ),
    ).toEqual({
      severity: 'warning',
      code: 'TABLE_BAD_DATE',
      message: "“31.02.2026” isn't a date in DD.MM.YYYY. The cell was left empty.",
      location: 'Line 12',
      original: '31.02.2026',
      used: null,
    });
  });

  it('cuts every text to 200 characters with an ellipsis', () => {
    const issue = makeIssue(
      'TABLE_MISSING_NAME',
      { code: 'X'.repeat(300) },
      { original: 'ş'.repeat(250) },
    );
    expect(issue.message).toHaveLength(200);
    expect(issue.message.endsWith('…')).toBe(true);
    expect(issue.original).toBe(`${'ş'.repeat(199)}…`);
  });

  it('keeps the outcome labels', async () => {
    const { OUTCOME_LABELS } = await import('@/import/outcomes');
    expect(OUTCOME_LABELS).toEqual({
      used: 'Used for dates',
      kept: 'Kept for display and export',
      not_read: 'Not read; still in the original file',
    });
  });
});
