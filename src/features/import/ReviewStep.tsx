import { Copy } from 'lucide-react';
import { useId } from 'react';
import type { ReactElement, Ref } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ImportReport, TextEncodingName } from '@/data/types';
import { copyDetailsText } from '@/features/import/copy-details';
import { BLOCKED_ERRORS_MESSAGE, formatDisplayName } from '@/features/import/import-schema';
import { ReportView } from '@/features/import/ReportView';
import { SCHEDULE_CODE_HINT } from '@/features/schedules/schedule-schema';

export interface AnalyzedProjectRow {
  project: {
    id: string;
    code: string | null;
    name: string | null;
    exportFlag: boolean;
    baselineOf: string | null;
  };
  report: ImportReport;
  firstActivities: string[];
  initialStatusSource: ImportReport['statusDate']['source'];
}

export interface ReviewStepProps {
  file: File;
  projectRows: readonly AnalyzedProjectRow[];
  selectedProjectId: string | null;
  onSelectProject(projectId: string): void;
  activeRow: AnalyzedProjectRow | null;
  name: string;
  onNameChange(value: string): void;
  nameError?: string;
  nameInputRef?: Ref<HTMLInputElement>;
  code: string;
  onCodeChange(value: string): void;
  codeError?: string;
  codeInputRef?: Ref<HTMLInputElement>;
  statusDate: string;
  onStatusDateChange(value: string): void;
  statusDateError?: string;
  statusDateInputRef?: Ref<HTMLInputElement>;
  importAlert: string | null;
  alertRef?: Ref<HTMLParagraphElement>;
  codeFields?: readonly string[];
  onActivityCodeField?: (field: string) => void;
  onEncoding?: (encoding: TextEncodingName) => void;
  disabled?: boolean;
}

function statusDateHint(source: ImportReport['statusDate']['source']): string {
  switch (source) {
    case 'file':
      return 'From the file';
    case 'earliest-start':
      return 'Not in the file. The earliest task start is filled in.';
    default:
      return "Not in the file. Leave it empty to use the project's status date.";
  }
}

function acceptedActivities(report: ImportReport): number {
  return report.counts.find((c) => c.entity === 'activity')?.accepted ?? 0;
}

/**
 * Step 3 (or 2 for XER/MSPDI) of the stepped import dialog (spec §6.4):
 * multi-project XER picker when the file holds several projects, schedule Name/Code/Status date
 * fields, blocking error alerts, and the live `ReportView`.
 */
export function ReviewStep({
  file,
  projectRows,
  selectedProjectId,
  onSelectProject,
  activeRow,
  name,
  onNameChange,
  nameError,
  nameInputRef,
  code,
  onCodeChange,
  codeError,
  codeInputRef,
  statusDate,
  onStatusDateChange,
  statusDateError,
  statusDateInputRef,
  importAlert,
  alertRef,
  codeFields,
  onActivityCodeField,
  onEncoding,
  disabled = false,
}: ReviewStepProps): ReactElement {
  const nameId = useId();
  const nameErrorId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  const statusDateId = useId();
  const statusDateHintId = useId();
  const statusDateErrorId = useId();

  async function copyRowError(row: AnalyzedProjectRow): Promise<void> {
    const firstError = row.report.issues.find((issue) => issue.severity === 'error');
    const text = copyDetailsText({
      message: firstError?.message ?? BLOCKED_ERRORS_MESSAGE,
      code: firstError?.code ?? null,
      fileName: file.name,
      size: file.size,
      format: formatDisplayName(row.report.format, row.report.formatVersion),
      parserVersion: row.report.parserVersion,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Details copied');
    } catch {
      toast.error("Details couldn't be copied.");
    }
  }

  const isMultiProject = projectRows.length > 1;

  return (
    <div className="flex flex-col gap-5">
      {importAlert !== null && (
        <p
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {importAlert}
        </p>
      )}

      {isMultiProject && (
        <section aria-label="Projects in this file" className="flex flex-col gap-2">
          <h3 className="text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase">
            Projects in this file
          </h3>
          <RadioGroup
            value={selectedProjectId ?? ''}
            onValueChange={onSelectProject}
            disabled={disabled}
            className="block"
          >
            <div className="overflow-x-auto rounded-lg border border-border bg-card max-md:border-0 max-md:bg-transparent">
              <table className="w-full border-collapse text-left text-xs max-md:block">
                <caption className="sr-only">Projects in this file</caption>
                <thead className="max-md:sr-only">
                  <tr className="border-b border-border bg-muted/50 text-muted-foreground">
                    <th scope="col" className="w-10 px-3 py-2 font-medium">
                      <span className="sr-only">Select</span>
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Source
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Activities
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Issues
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border max-md:flex max-md:flex-col max-md:gap-2 max-md:divide-y-0">
                  {projectRows.map((row) => {
                    const hasErrors = row.report.issueTotals.error > 0;
                    const projectCode = row.project.code ?? row.project.id;
                    const projectName = row.project.name ?? projectCode;
                    const radioLabel = `Use ${projectCode} · ${projectName}`;
                    const sourceText =
                      row.project.baselineOf !== null
                        ? `${file.name} · ${projectCode} · Baseline of ${row.project.baselineOf}`
                        : `${file.name} · ${projectCode}`;
                    return (
                      <tr
                        key={row.project.id}
                        className="max-md:flex max-md:flex-col max-md:gap-2 max-md:rounded-lg max-md:border max-md:border-border max-md:bg-card max-md:p-3"
                      >
                        <td className="px-3 py-2 align-top max-md:p-0">
                          <RadioGroupItem
                            value={row.project.id}
                            aria-label={radioLabel}
                            disabled={disabled || hasErrors}
                            className="mt-0.5 focus-visible:ring-ring"
                          />
                        </td>
                        <td className="px-3 py-2 align-top max-md:p-0">
                          <div className="font-medium text-foreground">{projectName}</div>
                          <div className="text-muted-foreground">{sourceText}</div>
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums max-md:p-0 max-md:text-left">
                          {acceptedActivities(row.report).toLocaleString('en-US')}
                        </td>
                        <td className="px-3 py-2 align-top max-md:p-0">
                          <div className="tabular-nums">
                            {`${row.report.issueTotals.error} errors · ${row.report.issueTotals.warning} warnings`}
                          </div>
                          {hasErrors && (
                            <div className="mt-1.5 flex flex-col gap-1.5">
                              <p className="text-destructive">{BLOCKED_ERRORS_MESSAGE}</p>
                              <div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => void copyRowError(row)}
                                  className="border-input bg-card dark:bg-card"
                                >
                                  <Copy className="size-3.5" aria-hidden="true" />
                                  Copy details
                                </Button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </RadioGroup>
        </section>
      )}

      {activeRow !== null && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={nameId} className="text-xs font-semibold">
                Name
              </Label>
              <Input
                ref={nameInputRef}
                id={nameId}
                autoComplete="off"
                aria-required="true"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? nameErrorId : undefined}
                readOnly={disabled}
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
              />
              {nameError && (
                <p id={nameErrorId} className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={codeId} className="text-xs font-semibold">
                Code
              </Label>
              <Input
                ref={codeInputRef}
                id={codeId}
                autoComplete="off"
                spellCheck={false}
                aria-required="true"
                aria-invalid={codeError ? true : undefined}
                aria-describedby={codeError ? `${codeHintId} ${codeErrorId}` : codeHintId}
                readOnly={disabled}
                className="font-mono"
                value={code}
                onChange={(event) => onCodeChange(event.target.value)}
              />
              <p id={codeHintId} className="text-xs text-muted-foreground">
                {SCHEDULE_CODE_HINT}
              </p>
              {codeError && (
                <p id={codeErrorId} className="text-xs text-destructive">
                  {codeError}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor={statusDateId} className="text-xs font-semibold">
                Status date
              </Label>
              <Input
                ref={statusDateInputRef}
                id={statusDateId}
                type="date"
                autoComplete="off"
                aria-invalid={statusDateError ? true : undefined}
                aria-describedby={
                  statusDateError ? `${statusDateHintId} ${statusDateErrorId}` : statusDateHintId
                }
                readOnly={disabled}
                className="dark:scheme-dark"
                value={statusDate}
                onChange={(event) => onStatusDateChange(event.target.value)}
              />
              <p id={statusDateHintId} className="text-xs text-muted-foreground">
                {statusDateHint(activeRow.initialStatusSource)}
              </p>
              {statusDateError && (
                <p id={statusDateErrorId} className="text-xs text-destructive">
                  {statusDateError}
                </p>
              )}
            </div>
          </div>

          <ReportView
            report={activeRow.report}
            scheduleName={name}
            mode="review"
            firstActivities={activeRow.firstActivities}
            codeFields={codeFields}
            onActivityCodeField={onActivityCodeField}
            onEncoding={onEncoding}
          />
        </>
      )}
    </div>
  );
}
