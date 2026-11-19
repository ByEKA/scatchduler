import { AlertCircle, AlertTriangle, ChevronRight, Download, Info } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useId, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  POPOVER_SHELL_CLASSES,
  SELECT_ITEM_HIGHLIGHT_CLASSES,
} from '@/components/common/popover-classes';
import { Label } from '@/components/ui/label';
import { Select, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type {
  ImportIssue,
  ImportIssueSeverity,
  ImportOutcome,
  ImportReport,
  TextEncodingName,
} from '@/data/types';
import {
  ACTIVITY_TYPE_LABELS,
  activityCodeFieldLabel,
  BOM_ENCODING_LABELS,
  CHECK_ISSUE_CODES,
  CHECK_LABELS,
  COUNT_ENTITY_LABELS,
  COUNT_ENTITY_ORDER,
  ENCODING_LABELS,
  formatDisplayName,
  ISSUE_GROUP_TITLES,
  OUTCOME_GROUP_LABELS,
  TEXT_ENCODING_OPTIONS,
} from '@/features/import/import-schema';
import { useDownloadImportReport } from '@/hooks/useImportReport';
import { fileSize, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const INITIAL_VISIBLE_ISSUES = 50;
const OUTCOME_ORDER: readonly ImportOutcome[] = ['used', 'kept', 'not_read'];

interface IssueGroup {
  code: string;
  severity: ImportIssueSeverity;
  title: string;
  issues: ImportIssue[];
}

function groupIssues(issues: readonly ImportIssue[]): IssueGroup[] {
  const groups = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const existing = groups.get(issue.code);
    if (existing !== undefined) {
      existing.issues.push(issue);
    } else {
      groups.set(issue.code, {
        code: issue.code,
        severity: issue.severity,
        title: ISSUE_GROUP_TITLES[issue.code] ?? issue.code,
        issues: [issue],
      });
    }
  }
  return [...groups.values()];
}

function SeverityIcon({ severity }: { severity: ImportIssueSeverity }): ReactElement {
  if (severity === 'error') {
    return <AlertCircle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />;
  }
  if (severity === 'warning') {
    return (
      <AlertTriangle className="size-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />
    );
  }
  return <Info className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export interface ReportViewProps {
  report: ImportReport;
  scheduleName: string;
  mode: 'review' | 'stored';
  firstActivities?: readonly string[];
  codeFields?: readonly string[];
  onActivityCodeField?: (field: string) => void;
  onEncoding?: (encoding: TextEncodingName) => void;
}

/**
 * Shared report view for the Review step (`mode="review"`) and the stored Import report dialog
 * (`mode="stored"`) (spec §5.9, §6.4).
 */
export function ReportView({
  report,
  scheduleName,
  mode,
  firstActivities,
  codeFields,
  onActivityCodeField,
  onEncoding,
}: ReportViewProps): ReactElement {
  const downloadReport = useDownloadImportReport();
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [expandedCodes, setExpandedCodes] = useState<ReadonlySet<string>>(() => new Set());
  const codeFieldId = useId();
  const encodingId = useId();

  const totalIssues =
    report.issueTotals.error + report.issueTotals.warning + report.issueTotals.info;
  const visibleIssues = useMemo(
    () => (showAllIssues ? report.issues : report.issues.slice(0, INITIAL_VISIBLE_ISSUES)),
    [report.issues, showAllIssues],
  );
  const issueGroups = useMemo(() => groupIssues(visibleIssues), [visibleIssues]);

  const countByEntity = new Map(report.counts.map((c) => [c.entity, c]));
  const formatText = formatDisplayName(report.format, report.formatVersion);
  const showCodeSelect =
    mode === 'review' &&
    report.format === 'mspdi' &&
    codeFields !== undefined &&
    codeFields.length > 0 &&
    onActivityCodeField !== undefined;
  const showEncodingSelect =
    mode === 'review' &&
    report.format === 'xer' &&
    report.encoding !== null &&
    report.encoding.detectedBy !== 'bom' &&
    onEncoding !== undefined;
  const showFirstActivities =
    mode === 'review' &&
    (report.format === 'xer' || report.format === 'csv') &&
    firstActivities !== undefined &&
    firstActivities.length > 0;

  const encodingReadOnlyText =
    report.encoding === null
      ? null
      : report.encoding.detectedBy === 'bom'
        ? (BOM_ENCODING_LABELS[report.encoding.name] ?? ENCODING_LABELS[report.encoding.name])
        : ENCODING_LABELS[report.encoding.name];

  function toggleGroup(code: string): void {
    setExpandedCodes((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function revealCheckIssues(codes: readonly string[]): void {
    setShowAllIssues(true);
    setExpandedCodes((current) => {
      const next = new Set(current);
      for (const code of codes) next.add(code);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      {/* File & format metadata */}
      <dl className="grid gap-3 rounded-lg border border-border bg-card p-3.5 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">File</dt>
          <dd className="min-w-0 truncate font-medium" title={report.file.name}>
            {`${report.file.name} · ${fileSize(report.file.size)}`}
          </dd>
        </div>

        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">Format</dt>
          <dd className="flex flex-wrap items-baseline gap-1.5 font-medium">
            <span>{formatText}</span>
            {report.formatFromContent && (
              <span className="text-xs font-normal text-muted-foreground">
                (read from the content)
              </span>
            )}
          </dd>
        </div>

        {report.format === 'mspdi' && (
          <div className="flex min-w-0 flex-col gap-1">
            {showCodeSelect ? (
              <>
                <Label htmlFor={codeFieldId} className="text-xs font-medium text-muted-foreground">
                  Activity codes
                </Label>
                <Select
                  value={report.activityCodeField ?? 'UID'}
                  onValueChange={onActivityCodeField}
                >
                  <SelectTrigger id={codeFieldId} size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className={cn(
                        POPOVER_SHELL_CLASSES,
                        'max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-y-auto',
                      )}
                    >
                      <SelectPrimitive.Viewport>
                        {codeFields.map((field) => (
                          <SelectItem
                            key={field}
                            value={field}
                            className={cn('h-8 py-0', SELECT_ITEM_HIGHLIGHT_CLASSES)}
                          >
                            {activityCodeFieldLabel(field)}
                          </SelectItem>
                        ))}
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </Select>
                {report.activityCodeField === 'ID' && (
                  <p className="text-xs text-muted-foreground">
                    IDs change when rows are inserted, so later updates may not match.
                  </p>
                )}
              </>
            ) : (
              <>
                <dt className="text-xs font-medium text-muted-foreground">Activity codes</dt>
                <dd>{activityCodeFieldLabel(report.activityCodeField)}</dd>
              </>
            )}
          </div>
        )}

        {report.encoding !== null && (
          <div className="flex min-w-0 flex-col gap-1">
            {showEncodingSelect ? (
              <>
                <Label htmlFor={encodingId} className="text-xs font-medium text-muted-foreground">
                  Text encoding
                </Label>
                <Select
                  value={report.encoding.name}
                  onValueChange={(value) => onEncoding(value as TextEncodingName)}
                >
                  <SelectTrigger id={encodingId} size="sm" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectPrimitive.Portal>
                    <SelectPrimitive.Content
                      position="popper"
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className={cn(
                        POPOVER_SHELL_CLASSES,
                        'max-h-(--radix-select-content-available-height) w-(--radix-select-trigger-width) overflow-y-auto',
                      )}
                    >
                      <SelectPrimitive.Viewport>
                        {TEXT_ENCODING_OPTIONS.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className={cn('h-8 py-0', SELECT_ITEM_HIGHLIGHT_CLASSES)}
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectPrimitive.Viewport>
                    </SelectPrimitive.Content>
                  </SelectPrimitive.Portal>
                </Select>
                {report.encoding.detectedBy !== 'user' && (
                  <p className="text-xs text-muted-foreground">
                    {`Detected: ${ENCODING_LABELS[report.encoding.name]}`}
                  </p>
                )}
              </>
            ) : (
              <>
                <dt className="text-xs font-medium text-muted-foreground">Text encoding</dt>
                <dd>{encodingReadOnlyText}</dd>
              </>
            )}
          </div>
        )}

        {(report.dateRange.start !== null || report.dateRange.finish !== null) && (
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-xs font-medium text-muted-foreground">Dates</dt>
            <dd>{`${shortDate(report.dateRange.start)} – ${shortDate(report.dateRange.finish)}`}</dd>
          </div>
        )}

        {report.settings.length > 0 && (
          <div className="flex min-w-0 flex-col gap-0.5 sm:col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">Scheduling settings</dt>
            <dd className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {report.settings.map((setting) => (
                <span key={setting.key}>{`${setting.key}: ${setting.value}`}</span>
              ))}
            </dd>
          </div>
        )}

        {showFirstActivities && (
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <dt className="text-xs font-medium text-muted-foreground">First activities</dt>
            <dd>
              <ul className="flex flex-wrap gap-1.5">
                {firstActivities.map((name, index) => (
                  <li
                    key={`${index}-${name}`}
                    className="rounded-sm bg-muted px-2 py-0.5 text-xs text-foreground"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      {/* Counts table */}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full border-collapse text-left text-xs">
          <caption className="sr-only">Counts</caption>
          <thead>
            <tr className="border-b border-border bg-muted/50 text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium" />
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Read
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Accepted
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Adjusted
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Skipped
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {COUNT_ENTITY_ORDER.map((entity) => {
              const row = countByEntity.get(entity) ?? {
                entity,
                read: 0,
                accepted: 0,
                adjusted: 0,
                skipped: 0,
              };
              return (
                <tr key={entity}>
                  <th scope="row" className="px-3 py-2 font-medium text-foreground">
                    {COUNT_ENTITY_LABELS[entity]}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.read.toLocaleString('en-US')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.accepted.toLocaleString('en-US')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.adjusted.toLocaleString('en-US')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.skipped.toLocaleString('en-US')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <section aria-label="Summary" className="flex flex-col gap-2">
        <h4 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Summary
        </h4>
        <dl className="grid gap-3 rounded-lg border border-border bg-card p-3.5 text-xs sm:grid-cols-3">
          <div className="flex flex-col gap-0.5 sm:col-span-2">
            <dt className="font-medium text-muted-foreground">Activities by type</dt>
            <dd>
              {report.breakdown.activitiesByType.length === 0
                ? 'None'
                : report.breakdown.activitiesByType
                    .map(
                      (item) =>
                        `${ACTIVITY_TYPE_LABELS[item.type] ?? item.type}: ${item.count.toLocaleString('en-US')}`,
                    )
                    .join(' · ')}
            </dd>
          </div>
          <div className="flex gap-4">
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-muted-foreground">Started</dt>
              <dd className="tabular-nums">
                {report.breakdown.activitiesStarted.toLocaleString('en-US')}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="font-medium text-muted-foreground">Completed</dt>
              <dd className="tabular-nums">
                {report.breakdown.activitiesCompleted.toLocaleString('en-US')}
              </dd>
            </div>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium text-muted-foreground">Relationships by type</dt>
            <dd>
              {report.breakdown.relationshipsByType.length === 0
                ? 'None'
                : report.breakdown.relationshipsByType
                    .map((item) => `${item.type}: ${item.count.toLocaleString('en-US')}`)
                    .join(' · ')}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium text-muted-foreground">Constraints</dt>
            <dd className="tabular-nums">{report.breakdown.constraints.toLocaleString('en-US')}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-medium text-muted-foreground">Calendar exceptions</dt>
            <dd className="tabular-nums">
              {report.breakdown.calendarExceptions.toLocaleString('en-US')}
            </dd>
          </div>
        </dl>
      </section>

      {/* Checks */}
      <section aria-label="Checks" className="flex flex-col gap-2">
        <h4 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
          Checks
        </h4>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-card p-3.5 text-xs">
          {report.checks.map((check) => (
            <div key={check.id} className="contents">
              <dt className="text-foreground">{CHECK_LABELS[check.id]}</dt>
              <dd className="text-right tabular-nums">
                {check.findings === 0 ? (
                  <span className="text-muted-foreground">No findings</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => revealCheckIssues(CHECK_ISSUE_CODES[check.id])}
                    className="font-medium text-link hover:underline focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {`${check.findings} findings`}
                  </button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* What happened to each part of the file */}
      <section aria-label="What happened to each part of the file" className="flex flex-col gap-2">
        <h4 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
          What happened to each part of the file
        </h4>
        <div className="grid gap-3 rounded-lg border border-border bg-card p-3.5 text-xs sm:grid-cols-3">
          {OUTCOME_ORDER.map((kind) => {
            const entries = report.outcomes.filter((o) => o.outcome === kind);
            return (
              <div key={kind} className="flex flex-col gap-1.5">
                <h5 className="font-medium text-foreground">{OUTCOME_GROUP_LABELS[kind]}</h5>
                {entries.length === 0 ? (
                  <p className="text-muted-foreground">—</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-muted-foreground">
                    {entries.map((entry) => (
                      <li key={entry.element}>
                        {`${entry.element} (${entry.items.toLocaleString('en-US')})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          The original file is kept with the schedule.
        </p>
      </section>

      {/* Issues */}
      <section aria-label="Issues" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Issues
          </h4>
          <p className="text-xs font-medium text-muted-foreground tabular-nums">
            {`${report.issueTotals.error} errors · ${report.issueTotals.warning} warnings · ${report.issueTotals.info} notes`}
          </p>
        </div>

        {report.issues.length < totalIssues && (
          <p className="text-xs text-muted-foreground">
            {`Showing ${report.issues.length} of ${totalIssues} issues. The totals count every issue.`}
          </p>
        )}

        {issueGroups.length > 0 && (
          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {issueGroups.map((group) => {
              const expanded = expandedCodes.has(group.code);
              return (
                <div key={group.code} className="text-xs">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.code)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 shrink-0 text-muted-foreground transition-transform',
                        expanded && 'rotate-90',
                      )}
                      aria-hidden="true"
                    />
                    <SeverityIcon severity={group.severity} />
                    <span className="min-w-0 flex-1 font-medium text-foreground">
                      {group.title}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {group.issues.length}
                    </span>
                  </button>
                  {expanded && (
                    <ul className="flex flex-col gap-1.5 border-t border-border bg-muted/30 px-3 py-2.5 pl-9">
                      {group.issues.map((issue, index) => (
                        <li key={`${group.code}-${index}`} className="flex flex-col gap-0.5">
                          <span className="text-foreground">{issue.message}</span>
                          {issue.location !== null && (
                            <span className="font-mono text-2xs text-muted-foreground">
                              {issue.location}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {report.issues.length > INITIAL_VISIBLE_ISSUES && !showAllIssues && (
          <div>
            <button
              type="button"
              onClick={() => setShowAllIssues(true)}
              className="text-xs font-medium text-link hover:underline focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {`Show all ${report.issues.length}`}
            </button>
          </div>
        )}
      </section>

      {/* Downloads */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <button
          type="button"
          disabled={downloadReport.isPending}
          onClick={() =>
            downloadReport.mutate({
              report,
              scheduleName: scheduleName.trim() || report.file.name,
              format: 'csv',
            })
          }
          className="inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download CSV
        </button>
        <button
          type="button"
          disabled={downloadReport.isPending}
          onClick={() =>
            downloadReport.mutate({
              report,
              scheduleName: scheduleName.trim() || report.file.name,
              format: 'json',
            })
          }
          className="inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Download JSON
        </button>
      </div>
    </div>
  );
}
