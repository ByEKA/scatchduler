import { describe, expect, it } from 'vitest';
import xer from '@/import/__fixtures__/two-projects.xer?bytes';
import msp from '@/import/__fixtures__/msp-table.csv?bytes';
import { analyze, inspect } from '@/import/index';
import { bytesOf, generateXer } from '@/import/testing';

const analyzed = async (bytes: Uint8Array, name: string) => {
  const inspected = await inspect(bytes, name);
  if (inspected.kind === 'refused') throw new Error(inspected.message);
  const outcome = await analyze(bytes, name, inspected.mapping);
  if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
  return outcome.report;
};

describe('the import report', () => {
  it('orders issues errors, warnings, notes and keeps the totals exact while capping the dry run at 5,000', async () => {
    const report = await analyzed(xer, 'north.xer');
    const severities = report.issues.map((i) => i.severity);
    expect(severities).toEqual(
      [...severities].sort(
        (a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b),
      ),
    );
    expect(report.issueTotals).toEqual({ error: 0, warning: 4, info: 3 });
    const many = await analyzed(
      generateXer({ activities: 6000, links: 0, missingCalendars: true }),
      'many.xer',
    );
    expect(many.issues).toHaveLength(5000);
    expect(many.issueTotals.info + many.issueTotals.warning).toBeGreaterThan(5000);
  });

  it('carries the summary, date range, units, outcomes and the file', async () => {
    const report = await analyzed(xer, 'north.xer');
    expect(report).toMatchObject({
      schemaVersion: 1,
      format: 'xer',
      formatVersion: '20.12',
      formatFromContent: false,
      file: { name: 'north.xer', size: xer.length },
      statusDate: { date: '2026-10-15', time: '08:00', source: 'file' },
      dateRange: { start: '2026-09-01', finish: '2026-12-18' },
      breakdown: {
        activitiesStarted: 4,
        activitiesCompleted: 2,
        constraints: 1,
        calendarExceptions: 2,
      },
    });
    expect(report.outcomes.map((o) => o.element)).toEqual(
      expect.arrayContaining(['Activities', 'Resources', 'Scheduling settings']),
    );
    expect(report.issues.map((i) => i.code)).toContain('STATUS_TIME_KEPT');
  });

  it('notes the generated calendars and the table options', async () => {
    const report = await analyzed(msp, 'tasks.csv');
    expect(report.issues.find((i) => i.code === 'CALENDAR_GENERATED_STANDARD')!.message).toBe(
      'Calendar Standard was added as the default calendar: Monday to Friday from 08:00, 8 hours a day.',
    );
    expect(report.table).toMatchObject({
      delimiter: ',',
      dateFormat: 'MM/DD/YYYY',
      predecessorRef: 'taskId',
      assumptions: { weekUnitDays: 5 },
    });
    expect(report.table).not.toHaveProperty('columns');
    expect(report.counts[0]).toEqual({
      entity: 'calendar',
      read: 0,
      accepted: 0,
      adjusted: 0,
      skipped: 0,
    });
  });
});

// STATUS_DATE_MISSING (§5.12, D46): an XER whose project has no status date. The reader takes
// data_date when last_recalc_date is absent (D58), so only a file without both gets the note.
describe('the import report: an XER without a status date', () => {
  // generateXer's PROJECT table: proj_id, proj_short_name, export_flag, last_recalc_date
  // (2026-01-05 00:00), plan_start_date, scd_end_date and clndr_id.
  const generated = new TextDecoder().decode(generateXer({ activities: 1, links: 0 }));
  const replaced = (...changes: Array<[string, string]>) => {
    let text = generated;
    for (const [from, to] of changes) {
      expect(text.split(from)).toHaveLength(2);
      text = text.replace(from, to);
    }
    return bytesOf(text);
  };

  it('notes a file with neither last_recalc_date nor data_date', async () => {
    const withoutColumn = replaced(
      ['\tlast_recalc_date\t', '\t'],
      ['\tY\t2026-01-05 00:00\t', '\tY\t'],
    );
    const report = await analyzed(withoutColumn, 'plan.xer');
    expect(report.statusDate).toEqual({ date: null, time: null, source: 'none' });
    expect(report.issues.filter((i) => i.code === 'STATUS_DATE_MISSING')).toEqual([
      {
        severity: 'info',
        code: 'STATUS_DATE_MISSING',
        message: 'The file has no status date.',
        location: null,
        original: null,
        used: null,
      },
    ]);
  });

  it('takes data_date when last_recalc_date is absent and gives no note', async () => {
    const report = await analyzed(replaced(['\tlast_recalc_date\t', '\tdata_date\t']), 'plan.xer');
    expect(report.statusDate).toEqual({ date: '2026-01-05', time: '00:00', source: 'file' });
    expect(report.issues.map((i) => i.code)).not.toContain('STATUS_DATE_MISSING');
    const recalc = await analyzed(bytesOf(generated), 'plan.xer');
    expect(recalc.statusDate).toEqual({ date: '2026-01-05', time: '00:00', source: 'file' });
    expect(recalc.issues.map((i) => i.code)).not.toContain('STATUS_DATE_MISSING');
  });
});
