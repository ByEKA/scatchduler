import type {
  ImportFormat,
  ImportIssue,
  ImportIssueSeverity,
  ImportReport,
  ISODate,
  TableMapping,
} from '@/data/types';
import { runChecks } from './checks';
import { encodingIssues } from './encoding';
import { makeIssue } from './issues';
import type { ImportActivity, ImportRelationship, WallClock } from './model';
import { OUTCOME_CATALOG } from './outcomes';
import type { ReadResult } from './read-result';
import { PARSER_VERSION } from './version';

// The import report (P3 core spec §4.1, §5.9): what the reader found, the checks, the outcomes of
// the source's elements and every issue — errors, then warnings, then notes, each in arrival
// order, the first 5,000 kept in this dry-run report and the totals always exact (§5.10).

export interface ReportContext {
  format: ImportFormat;
  fileName: string;
  size: number;
  sha256: string;
  formatFromContent: boolean;
  extension: string; // the file name's, without the dot
  encoding: ImportReport['encoding'];
  invalidBytes: number; // bytes the decoder replaced with U+FFFD (ENCODING_INVALID_BYTES)
  noNamespace: boolean; // Microsoft Project XML without its namespace (MSPDI_NO_NAMESPACE, D52)
  table: TableMapping | null;
  activityCodeField: string | null;
  statusDate: ISODate | null; // the status date the caller gives; null to use the file's
  durationMs: number;
}

export const FORMAT_LABELS: Record<ImportFormat, string> = {
  xer: 'Primavera P6 XER',
  mspdi: 'Microsoft Project XML',
  xlsx: 'Excel workbook',
  csv: 'CSV file',
};

const MAX_ISSUES = 5000;
const SEVERITIES: readonly ImportIssueSeverity[] = ['error', 'warning', 'info'];
const ACTIVITY_TYPES: ReadonlyArray<ImportActivity['type']> = [
  'task',
  'start_milestone',
  'finish_milestone',
  'level_of_effort',
  'wbs_summary',
];
const LINK_TYPES: ReadonlyArray<ImportRelationship['type']> = ['FS', 'SS', 'FF', 'SF'];

function datePart(value: WallClock | null): ISODate | null {
  return value === null ? null : value.slice(0, 10);
}

/** The accepted activities' span: the earliest actual or planned start, the latest finish. */
function dateRangeOf(read: ReadResult): ImportReport['dateRange'] {
  let start: WallClock | null = null;
  let finish: WallClock | null = null;
  for (const activity of read.model.activities) {
    const from = activity.actual.start ?? activity.planned.start;
    const to = activity.actual.finish ?? activity.planned.finish;
    if (from !== null && (start === null || from < start)) start = from;
    if (to !== null && (finish === null || to > finish)) finish = to;
  }
  return { start: datePart(start), finish: datePart(finish) };
}

function breakdownOf(read: ReadResult): ImportReport['breakdown'] {
  const { activities, relationships, calendars } = read.model;
  const byType = new Map<string, number>();
  let started = 0;
  let completed = 0;
  let constraints = 0;
  for (const activity of activities) {
    byType.set(activity.type, (byType.get(activity.type) ?? 0) + 1);
    if (activity.status !== 'not_started') started += 1;
    if (activity.status === 'completed') completed += 1;
    if (activity.constraint !== null) constraints += 1;
    if (activity.secondaryConstraint !== null) constraints += 1;
  }
  const byLink = new Map<string, number>();
  for (const relationship of relationships) {
    byLink.set(relationship.type, (byLink.get(relationship.type) ?? 0) + 1);
  }
  return {
    activitiesByType: ACTIVITY_TYPES.filter((type) => byType.has(type)).map((type) => ({
      type,
      count: byType.get(type) ?? 0,
    })),
    activitiesStarted: started,
    activitiesCompleted: completed,
    relationshipsByType: LINK_TYPES.filter((type) => byLink.has(type)).map((type) => ({
      type,
      count: byLink.get(type) ?? 0,
    })),
    constraints,
    calendarExceptions: calendars.reduce((total, c) => total + c.exceptions.length, 0),
  };
}

/** The catalog's elements, in catalog order, that the read found, with their item counts. */
function outcomesOf(format: ImportFormat, read: ReadResult): ImportReport['outcomes'] {
  const items = new Map(read.elements.map((e) => [e.element, e.items]));
  const outcomes: ImportReport['outcomes'] = [];
  for (const { element, outcome } of OUTCOME_CATALOG[format]) {
    const count = items.get(element);
    if (count !== undefined && count > 0) outcomes.push({ element, outcome, items: count });
  }
  return outcomes;
}

function withoutColumns(table: TableMapping): Omit<TableMapping, 'columns'> {
  const copy: Partial<TableMapping> = { ...table };
  delete copy.columns;
  return copy as Omit<TableMapping, 'columns'>;
}

export function buildReport(read: ReadResult, context: ReportContext): ImportReport {
  const statusDate: ImportReport['statusDate'] =
    context.statusDate !== null
      ? { date: context.statusDate, time: null, source: 'user' }
      : { ...read.statusDate };
  const dateRange = dateRangeOf(read);
  const checks = runChecks(read.model, read.issues, {
    statusDate: statusDate.date,
    statusSource: statusDate.source,
    stated: read.sourceProject.stated,
    dateRange,
  });

  // Every issue in arrival order, then grouped by severity, keeping that order within each.
  const arrived: ImportIssue[][] = [];
  if (context.formatFromContent) {
    const format = FORMAT_LABELS[context.format];
    arrived.push([makeIssue('FORMAT_FROM_CONTENT', { ext: context.extension, format })]);
  }
  if (context.noNamespace) arrived.push([makeIssue('MSPDI_NO_NAMESPACE')]);
  // Encoding notes. An encoding the user chose is no guess, but the bytes a UTF-8 choice replaced
  // are still counted (ENCODING_INVALID_BYTES states a fact about the decode).
  if (context.encoding?.detectedBy === 'user') {
    if (context.invalidBytes > 0) {
      arrived.push([makeIssue('ENCODING_INVALID_BYTES', { n: context.invalidBytes })]);
    }
  } else if (context.encoding !== null) {
    const { name, detectedBy } = context.encoding;
    arrived.push(
      encodingIssues({ name, detectedBy, bomLength: 0, invalidBytes: context.invalidBytes }),
    );
  }
  arrived.push(read.issues);
  // STATUS_DATE_MISSING: an XER whose project has no status date (D46, D58).
  if (context.format === 'xer' && read.sourceProject.id !== null && read.statusDate.date === null) {
    arrived.push([makeIssue('STATUS_DATE_MISSING')]);
  }
  if (statusDate.source === 'file' && statusDate.time !== null && statusDate.time !== '00:00') {
    arrived.push([
      makeIssue('STATUS_TIME_KEPT', { date: statusDate.date ?? '', time: statusDate.time }),
    ]);
  }
  arrived.push(checks.issues);

  const bySeverity: Record<ImportIssueSeverity, ImportIssue[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const list of arrived) for (const issue of list) bySeverity[issue.severity].push(issue);
  const issues: ImportIssue[] = [];
  for (const severity of SEVERITIES) {
    for (const issue of bySeverity[severity]) {
      if (issues.length >= MAX_ISSUES) break;
      issues.push(issue);
    }
  }

  return {
    schemaVersion: 1,
    parserVersion: PARSER_VERSION,
    format: context.format,
    formatVersion: read.formatVersion,
    file: { name: context.fileName, size: context.size, sha256: context.sha256 },
    formatFromContent: context.formatFromContent,
    activityCodeField: context.format === 'mspdi' ? context.activityCodeField : null,
    sourceProject: read.sourceProject,
    encoding: context.encoding,
    table: context.table === null ? null : withoutColumns(context.table),
    statusDate,
    dateRange,
    units: read.units,
    settings: read.model.settings,
    counts: read.counts,
    breakdown: breakdownOf(read),
    outcomes: outcomesOf(context.format, read),
    checks: checks.checks,
    externalLinks: read.externalLinks,
    notImported: read.notImported,
    issueTotals: {
      error: bySeverity.error.length,
      warning: bySeverity.warning.length,
      info: bySeverity.info.length,
    },
    issues,
    durationMs: context.durationMs,
  };
}
