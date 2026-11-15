import { describe, expect, it } from 'vitest';
import mspdi from '@/import/__fixtures__/project.xml?bytes';
import { runChecks } from '@/import/checks';
import { analyze, inspect } from '@/import/index';
import { emptyModel, type ImportActivity } from '@/import/model';
import { bytesOf, mspdiXml } from '@/import/testing';
import type { ImportIssue } from '@/data/types';

const mapping = {
  schemaVersion: 1,
  format: 'mspdi',
  encoding: null,
  sourceProjectId: null,
  activityCodeField: 'UID',
  table: null,
} as const;
const findings = async (statusDate?: string | null) => {
  const outcome = await analyze(
    mspdi,
    'depot.xml',
    mapping,
    statusDate === undefined ? {} : { statusDate },
  );
  if (outcome.kind !== 'analyzed') throw new Error('refused');
  return Object.fromEntries(outcome.report.checks.map((c) => [c.id, c.findings]));
};

describe('checks', () => {
  it('runs every check, zeros included', async () => {
    expect(await findings()).toEqual({
      actual_after_status_date: 0,
      progress_without_actual_start: 0,
      complete_without_actual_finish: 0,
      status_date_fallback: 0,
      ambiguous_milestones: 0,
      percent_lags: 0,
      links_on_summaries: 0,
      external_links: 0,
      project_dates_differ: 0,
    });
  });

  it('runs them again against the status date it is given', async () => {
    expect(await findings('2026-03-02')).toMatchObject({ actual_after_status_date: 1 });
    const outcome = await analyze(mspdi, 'depot.xml', mapping, { statusDate: '2026-03-02' });
    expect(outcome.kind === 'analyzed' && outcome.report.statusDate).toEqual({
      date: '2026-03-02',
      time: null,
      source: 'user',
    });
  });

  it.each(['', '2026-13-45', '2026-02-30', '2026-3-2', 'yesterday'])(
    "uses the file's status date when the one given is %j, not a real 'YYYY-MM-DD' date",
    async (given) => {
      const fileOnly = await analyze(mspdi, 'depot.xml', mapping);
      const outcome = await analyze(mspdi, 'depot.xml', mapping, { statusDate: given });
      if (fileOnly.kind !== 'analyzed' || outcome.kind !== 'analyzed') throw new Error('refused');
      expect(fileOnly.report.statusDate).toMatchObject({ date: '2026-03-20', source: 'file' });
      expect(outcome.report.statusDate).toEqual(fileOnly.report.statusDate);
      expect(outcome.report.checks).toEqual(fileOnly.report.checks);
      expect(await findings(given)).toMatchObject({ actual_after_status_date: 0 });
    },
  );
});

// The checks the fixture leaves at zero, each given a finding (spec §7 Parser row: every check
// with and without findings), and the readings the plan leaves open.
describe('checks with findings', () => {
  const task = (uid: number, inner: string) =>
    `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>Task ${uid}</Name><OutlineLevel>1</OutlineLevel><OutlineNumber>${uid}</OutlineNumber>${inner}</Task>`;
  const day = (date: string) =>
    `<Start>${date}T08:00:00</Start><Finish>${date}T17:00:00</Finish><Duration>PT8H0M0S</Duration>`;
  const milestone = (time: string) =>
    `<Milestone>1</Milestone><Start>2026-03-02T${time}:00</Start><Finish>2026-03-02T${time}:00</Finish><Duration>PT0H0M0S</Duration>`;
  const link = (predecessor: number) =>
    `<PredecessorLink><PredecessorUID>${predecessor}</PredecessorUID><Type>1</Type></PredecessorLink>`;
  const run = async (xml: string, statusDate?: string) => {
    const outcome = await analyze(
      bytesOf(xml),
      'plan.xml',
      mapping,
      statusDate === undefined ? {} : { statusDate },
    );
    if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
    const { report } = outcome;
    return {
      report,
      findings: Object.fromEntries(report.checks.map((c) => [c.id, c.findings])),
      codes: report.issues.map((i) => i.code),
      messages: (code: string) =>
        report.issues.filter((i) => i.code === code).map((i) => i.message),
    };
  };

  it('status_date_fallback: the earliest task start filled in, and nothing once a status date is given', async () => {
    const tasks = task(1, day('2026-03-04')) + task(2, day('2026-03-02'));
    const filled = await run(mspdiXml({ tasks }));
    expect(filled.findings).toMatchObject({ status_date_fallback: 1 });
    expect(filled.messages('STATUS_DATE_FALLBACK')).toEqual([
      'The file has no valid status date. The earliest task start, 2026-03-02, was filled in. Check it before importing.',
    ]);
    expect(filled.report.statusDate).toEqual({
      date: '2026-03-02',
      time: '08:00',
      source: 'earliest-start',
    });
    // STATUS_DATE_MISSING is for XER only (D46).
    expect(filled.messages('STATUS_DATE_MISSING')).toEqual([]);

    const given = await run(mspdiXml({ tasks }), '2026-03-05');
    expect(given.findings).toMatchObject({ status_date_fallback: 0 });
    expect(given.messages('STATUS_DATE_FALLBACK')).toEqual([]);
    const stated = await run(
      mspdiXml({ project: '<StatusDate>2026-03-05T17:00:00</StatusDate>', tasks }),
    );
    expect(stated.findings).toMatchObject({ status_date_fallback: 0 });
    expect(stated.messages('STATUS_DATE_FALLBACK')).toEqual([]);
  });

  it('status_date_fallback: only a status date taken from the earliest task start is a finding', () => {
    const sources = ['file', 'user', 'none', 'earliest-start'] as const;
    const fallback = (statusSource: (typeof sources)[number]) =>
      runChecks(emptyModel('mspdi'), [], {
        statusDate: statusSource === 'none' ? null : '2026-03-02',
        statusSource,
        stated: { start: null, finish: null },
        dateRange: { start: null, finish: null },
      }).checks.find((c) => c.id === 'status_date_fallback')!.findings;
    expect(sources.map(fallback)).toEqual([0, 0, 0, 1]);
  });

  it("ambiguous_milestones: counts the reader's issues and adds none of its own", async () => {
    const tasks =
      task(1, milestone('10:00')) + task(2, milestone('15:00')) + task(3, day('2026-03-02'));
    const result = await run(
      mspdiXml({ project: '<StatusDate>2026-03-02T00:00:00</StatusDate>', tasks }),
    );
    expect(result.findings).toMatchObject({ ambiguous_milestones: 2 });
    // The reader's two issues are the report's only ones: the check adds none.
    expect(result.codes).toEqual(['MSPDI_MILESTONE_AMBIGUOUS', 'MSPDI_MILESTONE_AMBIGUOUS']);
    expect(result.messages('MSPDI_MILESTONE_AMBIGUOUS')).toEqual([
      '1 is a milestone at 10:00, neither the start nor the end of its working day. It is imported as a start milestone.',
      '2 is a milestone at 15:00, neither the start nor the end of its working day. It is imported as a start milestone.',
    ]);
  });

  it('links_on_summaries: counts the links skipped on summary tasks, to them and from them', async () => {
    const tasks = [
      `<Task><UID>1</UID><ID>1</ID><Name>Phase</Name><Summary>1</Summary><OutlineLevel>1</OutlineLevel><OutlineNumber>1</OutlineNumber>${link(2)}</Task>`,
      task(2, day('2026-03-02')),
      task(3, `${day('2026-03-03')}${link(1)}`),
    ].join('');
    const result = await run(
      mspdiXml({ project: '<StatusDate>2026-03-02T00:00:00</StatusDate>', tasks }),
    );
    expect(result.findings).toMatchObject({ links_on_summaries: 2 });
    expect(result.codes).toEqual(['MSPDI_SUMMARY_LINK', 'MSPDI_SUMMARY_LINK']);
    expect(result.messages('MSPDI_SUMMARY_LINK')).toEqual([
      "The link on summary task Phase was skipped. Summary tasks can't have links.",
      "The link on summary task Phase was skipped. Summary tasks can't have links.",
    ]);
  });

  it('project_dates_differ: a stated date that differs from the activities, a dash for one not stated', async () => {
    const tasks = task(1, day('2026-03-02')) + task(2, day('2026-03-04'));
    const project = (dates: string) =>
      mspdiXml({ project: `<StatusDate>2026-03-02T17:00:00</StatusDate>${dates}`, tasks });
    const both = await run(
      project(
        '<StartDate>2026-03-01T08:00:00</StartDate><FinishDate>2026-03-04T17:00:00</FinishDate>',
      ),
    );
    expect(both.findings).toMatchObject({ project_dates_differ: 1 });
    expect(both.messages('PROJECT_DATES_DIFFER')).toEqual([
      'The file states the project runs 2026-03-01 – 2026-03-04, but its activities run 2026-03-02 – 2026-03-04.',
    ]);
    const finishOnly = await run(project('<FinishDate>2026-03-06T17:00:00</FinishDate>'));
    expect(finishOnly.findings).toMatchObject({ project_dates_differ: 1 });
    expect(finishOnly.messages('PROJECT_DATES_DIFFER')).toEqual([
      'The file states the project runs — – 2026-03-06, but its activities run 2026-03-02 – 2026-03-04.',
    ]);
    const same = await run(
      project(
        '<StartDate>2026-03-02T08:00:00</StartDate><FinishDate>2026-03-04T17:00:00</FinishDate>',
      ),
    );
    expect(same.findings).toMatchObject({ project_dates_differ: 0 });
    expect(same.messages('PROJECT_DATES_DIFFER')).toEqual([]);
  });

  it('progress_without_actual_start: a completed activity gets only COMPLETE_WITHOUT_ACTUAL_FINISH (D64)', async () => {
    const csv = bytesOf(
      'Activity ID,Activity Name,% Complete\r\nA1,Done,100\r\nA2,Half,50\r\nA3,Not yet,0\r\n',
    );
    const inspected = await inspect(csv, 'plan.csv');
    if (inspected.kind === 'refused') throw new Error(inspected.message);
    const outcome = await analyze(csv, 'plan.csv', inspected.mapping);
    if (outcome.kind !== 'analyzed') throw new Error(outcome.message);
    const progress = (issues: readonly ImportIssue[]) =>
      issues
        .filter(
          (i) =>
            i.code === 'PROGRESS_WITHOUT_ACTUAL_START' ||
            i.code === 'COMPLETE_WITHOUT_ACTUAL_FINISH',
        )
        .map((i) => i.message);
    expect(progress(outcome.report.issues)).toEqual([
      'A2 shows progress but has no actual start.',
      'A1 is complete but has no actual finish.',
    ]);
    expect(Object.fromEntries(outcome.report.checks.map((c) => [c.id, c.findings]))).toMatchObject({
      progress_without_actual_start: 1,
      complete_without_actual_finish: 1,
    });

    // Completed by its status, its duration % or its physical %: each is left out.
    const base = outcome.model.activities[0]!;
    const activity = (
      code: string,
      status: ImportActivity['status'],
      duration: number | null,
      physical: number | null,
    ): ImportActivity => ({ ...base, code, status, percent: { duration, physical, type: null } });
    const model = {
      ...outcome.model,
      activities: [
        activity('S1', 'completed', null, 40),
        activity('D1', 'in_progress', 100, null),
        activity('P1', 'in_progress', 60, 100),
        activity('X1', 'in_progress', 60, 20),
      ],
    };
    const { checks, issues } = runChecks(model, [], {
      statusDate: null,
      statusSource: 'none',
      stated: { start: null, finish: null },
      dateRange: { start: null, finish: null },
    });
    expect(progress(issues)).toEqual([
      'X1 shows progress but has no actual start.',
      'S1 is complete but has no actual finish.',
      'D1 is complete but has no actual finish.',
      'P1 is complete but has no actual finish.',
    ]);
    expect(checks.find((c) => c.id === 'progress_without_actual_start')!.findings).toBe(1);
  });

  it('project_dates_differ: no finding while the activities have no dates to compare', () => {
    const { checks, issues } = runChecks(emptyModel('xer'), [], {
      statusDate: null,
      statusSource: 'none',
      stated: { start: '2026-03-01', finish: '2026-03-04' },
      dateRange: { start: null, finish: null },
    });
    expect(checks.find((c) => c.id === 'project_dates_differ')!.findings).toBe(0);
    expect(issues).toEqual([]);
  });
});
