import type { ImportCheckId, ImportIssue, ImportReport, ISODate } from '@/data/types';
import { makeIssue, type IssueCode } from './issues';
import type { ImportActivity, ImportModel } from './model';

// The import checks (P3 core spec §5.9): every check runs on every import and records its number
// of findings, zeros included, in the order of ImportCheckId (§4.1). The first three and the last
// two add an issue per finding; the other four count issues the readers already gave.

export interface CheckContext {
  statusDate: ISODate | null;
  statusSource: ImportReport['statusDate']['source'];
  stated: ImportReport['sourceProject']['stated'];
  dateRange: ImportReport['dateRange'];
}

// Checks whose findings are reader issues, with the codes they count.
const COUNTED: ReadonlyArray<[ImportCheckId, ReadonlySet<string>]> = [
  ['ambiguous_milestones', new Set<IssueCode>(['MSPDI_MILESTONE_AMBIGUOUS'])],
  ['percent_lags', new Set<IssueCode>(['PERCENT_LAG'])],
  ['links_on_summaries', new Set<IssueCode>(['MSPDI_SUMMARY_LINK'])],
  ['external_links', new Set<IssueCode>(['XER_CROSS_PROJECT_LINK', 'MSPDI_EXTERNAL_LINK'])],
];

/** The date part of a wall-clock value ('YYYY-MM-DDTHH:mm'). */
function datePart(value: string): ISODate {
  return value.slice(0, 10);
}

function above(value: number | null, limit: number): boolean {
  return value !== null && value > limit;
}

/** Completed, or a duration or physical % of 100. */
function isComplete(activity: ImportActivity): boolean {
  const { percent } = activity;
  return (
    activity.status === 'completed' ||
    (percent.duration !== null && percent.duration >= 100) ||
    (percent.physical !== null && percent.physical >= 100)
  );
}

export function runChecks(
  model: ImportModel,
  readIssues: readonly ImportIssue[],
  context: CheckContext,
): { checks: ImportReport['checks']; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const findings = new Map<ImportCheckId, number>();
  const add = (id: ImportCheckId, issue: ImportIssue | null) => {
    findings.set(id, (findings.get(id) ?? 0) + 1);
    if (issue) issues.push(issue);
  };

  // Actual dates after the status date, compared by date: a start or a finish is one finding each.
  const { statusDate } = context;
  if (statusDate !== null) {
    for (const activity of model.activities) {
      for (const which of ['start', 'finish'] as const) {
        const actual = activity.actual[which];
        if (actual !== null && datePart(actual) > statusDate) {
          add(
            'actual_after_status_date',
            makeIssue('ACTUAL_AFTER_STATUS_DATE', {
              code: activity.code,
              'start or finish': which,
              date: datePart(actual),
            }),
          );
        }
      }
    }
  }

  // Progress without an actual start: in progress, or a duration or physical % above 0. A completed
  // activity is left out: it gets only COMPLETE_WITHOUT_ACTUAL_FINISH (D64).
  for (const activity of model.activities) {
    const { percent } = activity;
    const progress =
      activity.status === 'in_progress' || above(percent.duration, 0) || above(percent.physical, 0);
    if (progress && !isComplete(activity) && activity.actual.start === null) {
      add(
        'progress_without_actual_start',
        makeIssue('PROGRESS_WITHOUT_ACTUAL_START', { code: activity.code }),
      );
    }
  }

  // Complete without an actual finish: completed, or 100 %.
  for (const activity of model.activities) {
    if (isComplete(activity) && activity.actual.finish === null) {
      add(
        'complete_without_actual_finish',
        makeIssue('COMPLETE_WITHOUT_ACTUAL_FINISH', { code: activity.code }),
      );
    }
  }

  // The status date was filled in from the earliest task start (§5.6).
  if (context.statusSource === 'earliest-start' && statusDate !== null) {
    add('status_date_fallback', makeIssue('STATUS_DATE_FALLBACK', { date: statusDate }));
  }

  // Reader issues the next four checks count; they add no issue of their own.
  for (const issue of readIssues) {
    for (const [id, codes] of COUNTED) if (codes.has(issue.code)) add(id, null);
  }

  // The project dates the file states differ from the span of its activities.
  const { stated, dateRange } = context;
  const differs = (statedDate: ISODate | null, activityDate: ISODate | null) =>
    statedDate !== null && activityDate !== null && statedDate !== activityDate;
  if (differs(stated.start, dateRange.start) || differs(stated.finish, dateRange.finish)) {
    add(
      'project_dates_differ',
      makeIssue('PROJECT_DATES_DIFFER', {
        start: stated.start ?? '—',
        finish: stated.finish ?? '—',
        activityStart: dateRange.start ?? '—',
        activityFinish: dateRange.finish ?? '—',
      }),
    );
  }

  const order: ImportCheckId[] = [
    'actual_after_status_date',
    'progress_without_actual_start',
    'complete_without_actual_finish',
    'status_date_fallback',
    'ambiguous_milestones',
    'percent_lags',
    'links_on_summaries',
    'external_links',
    'project_dates_differ',
  ];
  return { checks: order.map((id) => ({ id, findings: findings.get(id) ?? 0 })), issues };
}
