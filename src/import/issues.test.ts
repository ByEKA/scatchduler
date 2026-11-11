import { describe, expect, it } from 'vitest';
import { ISSUE_CATALOG, makeIssue, sliceText } from '@/import/issues';

describe('issue catalog', () => {
  it('holds the 71 codes of spec §5.12 with their severities', () => {
    const entries = Object.values(ISSUE_CATALOG);
    expect(entries).toHaveLength(71);
    expect(
      (['error', 'warning', 'info'] as const).map(
        (s) => entries.filter((e) => e.severity === s).length,
      ),
    ).toEqual([14, 37, 20]);
    expect(ISSUE_CATALOG.DUPLICATE_CODE).toEqual({
      severity: 'error',
      group: 'Repeated activity codes',
      message: 'Activity code {code} is used more than once.',
    });
    expect(ISSUE_CATALOG.CALENDAR_GENERATED_STANDARD.group).toBe('Generated calendars');
  });

  it('holds the codes of decisions D51, D53, D54, D55 and D57 with their copy', () => {
    expect(ISSUE_CATALOG.XER_CALENDAR_BASE_MISSING).toEqual({
      severity: 'warning',
      group: 'Calendars read without their base',
      message:
        "Calendar {name} is based on a calendar that isn't in the file. It was read as written, with the days P6 exported for it.",
    });
    expect(ISSUE_CATALOG.XER_UNKNOWN_VALUE).toEqual({
      severity: 'warning',
      group: 'Unknown values',
      message: "{code} has a {field} we don't know ({value}). {used} is used.",
    });
    expect(ISSUE_CATALOG.XER_DECIMAL_COMMA).toEqual({
      severity: 'warning',
      group: 'Decimal commas',
      message:
        "Numbers in this file use a decimal comma the file doesn't declare. They were read as decimals; check durations and percentages.",
    });
    expect(ISSUE_CATALOG.CALENDAR_DATA_REPAIRED).toEqual({
      severity: 'info',
      group: 'Repaired calendars',
      message: 'Calendar {name} had damaged data that was repaired.',
    });
    expect(ISSUE_CATALOG.FILE_TOO_MANY_EXCEPTIONS).toEqual({
      severity: 'error',
      group: 'Too many calendar exceptions',
      message: "The file's calendars hold more than 100,000 exception dates.",
    });
  });

  it('holds the codes of decision D52 with their copy', () => {
    expect(ISSUE_CATALOG.MSPDI_NO_NAMESPACE).toEqual({
      severity: 'info',
      group: 'Non-standard Microsoft Project XML',
      message: 'The file has no Microsoft Project namespace. It was read as Microsoft Project XML.',
    });
    expect(ISSUE_CATALOG.MSPDI_DATE_ZONE_DROPPED).toEqual({
      severity: 'info',
      group: 'Non-standard Microsoft Project XML',
      message:
        'Some dates carry a time zone or fractions of a second. They were read as the times written.',
    });
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
    expect(
      makeIssue('TABLE_MISSING_CODE', {}, { original: `${'x'.repeat(198)}😀😀` }).original,
    ).toBe(`${'x'.repeat(198)}…`);
  });

  it('keeps the start of a text without splitting a character made of two code units', () => {
    expect(sliceText('ab😀', 4)).toBe('ab😀');
    expect(sliceText('ab😀', 3)).toBe('ab');
    expect(sliceText('ab😀c', 2)).toBe('ab');
    expect(sliceText('abc', 5)).toBe('abc');
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
