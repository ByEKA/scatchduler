import { Check, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FormDialog, type DialogWidth } from '@/components/common/FormDialog';
import { Button } from '@/components/ui/button';
import { RepositoryError } from '@/data/errors';
import type {
  ID,
  ImportField,
  ImportMapping,
  ISODate,
  TableMapping,
  TextEncodingName,
} from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { isCodeTaken, suggestImportCode } from '@/features/files/codes';
import { isIsoDate } from '@/features/files/details-schema';
import { ColumnsStep } from '@/features/import/ColumnsStep';
import { FileStep, type FileInspectState } from '@/features/import/FileStep';
import {
  BLOCKED_ERRORS_MESSAGE,
  checkColumns,
  CHOOSE_SCHEDULE_MESSAGE,
  formatDisplayName,
  IMPORT_FIELD_ORDER,
  type ColumnErrorKey,
} from '@/features/import/import-schema';
import { ReviewStep, type AnalyzedProjectRow } from '@/features/import/ReviewStep';
import {
  defaultProjectId,
  filesPath,
  importFileSchema,
  scheduleNameFromFile,
} from '@/features/schedules/schedule-schema';
import { useScheduleDialogFallback } from '@/features/schedules/useScheduleDialogFallback';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import {
  packSnapshot,
  useImportParser,
  type ImportModel,
  type InspectOutcome,
  type TablePreview,
} from '@/hooks/useImportParser';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useImportSchedule } from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

type ImportStepId = 'file' | 'columns' | 'review';
type ValidInspect = Exclude<InspectOutcome, { kind: 'refused' }>;
type ScheduleInspect = Extract<InspectOutcome, { kind: 'schedule' }>;
type XerProjectEntry = ScheduleInspect['projects'][number];

const SCHEDULE_CODE_PATTERN = /^[A-Za-z0-9_.-]*$/;
const NO_CODES: readonly string[] = [];

const STEP_META: Record<ImportStepId, { label: string; description: string; width: DialogWidth }> =
  {
    file: {
      label: 'File',
      description: 'Upload a schedule exported from your planning tool.',
      width: 'xl',
    },
    columns: {
      label: 'Columns',
      description: "Match the file's columns to schedule fields.",
      width: '2xl',
    },
    review: {
      label: 'Review',
      description: 'Check what will be imported.',
      width: '3xl',
    },
  };

const COLUMN_ERROR_ORDER: readonly ColumnErrorKey[] = [
  'headerRow',
  'hoursPerDay',
  ...IMPORT_FIELD_ORDER,
];

function ImportStepper({
  steps,
  current,
}: {
  steps: readonly ImportStepId[];
  current: ImportStepId;
}): ReactElement {
  const currentIndex = Math.max(0, steps.indexOf(current));
  return (
    <div className="pt-2">
      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((id, index) => {
          const state =
            index === currentIndex ? 'current' : index < currentIndex ? 'completed' : 'upcoming';
          return (
            <li key={id} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-border" />}
              <span
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-full text-2xs font-semibold',
                    state === 'current' && 'bg-primary text-primary-foreground',
                    state === 'completed' && 'bg-brand-600/20 text-link',
                    state === 'upcoming' && 'border border-input text-muted-foreground',
                  )}
                >
                  {state === 'completed' ? <Check className="size-3" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium max-sm:sr-only',
                    state === 'current' ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {STEP_META[id].label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <p aria-live="polite" className="sr-only">
        {`Step ${currentIndex + 1} of ${steps.length}: ${STEP_META[current].label}`}
      </p>
    </div>
  );
}

function isCancelledError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'cancelled'
  );
}

function clientErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '' && error.message !== 'failed') {
    return error.message;
  }
  return "This file couldn't be read. It may be damaged or incomplete. Export it again from your planning tool and retry.";
}

function refreshMappedHeaders(
  columns: TableMapping['columns'],
  headers: readonly string[],
): TableMapping['columns'] {
  const next: TableMapping['columns'] = {};
  for (const field of IMPORT_FIELD_ORDER) {
    const entry = columns[field];
    if (entry === undefined) continue;
    const header = headers[entry.index];
    if (header !== undefined && header.trim() !== '') {
      next[field] = { index: entry.index, header };
    }
  }
  return next;
}

/** Flagged XER projects first, then non-flagged, each group in file order (D15). */
function orderXerProjects(projects: readonly XerProjectEntry[]): XerProjectEntry[] {
  return [
    ...projects.filter((project) => project.exportFlag),
    ...projects.filter((project) => !project.exportFlag),
  ];
}

/**
 * Default selected project in Review (D15, D56): for a single-project file, that row (even with
 * errors so the user sees its report); for a multi-project XER, the first row without errors
 * that isn't a baseline, else the first row without errors, else `null`.
 */
function pickDefaultProjectId(rows: readonly AnalyzedProjectRow[]): string | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!.project.id;
  const preferred =
    rows.find((row) => row.report.issueTotals.error === 0 && row.project.baselineOf === null) ??
    rows.find((row) => row.report.issueTotals.error === 0);
  return preferred?.project.id ?? null;
}

function validateReviewFields(
  values: { name: string; code: string; statusDate: string; badDate: boolean },
  existingCodes: readonly string[],
): { name?: string; code?: string; statusDate?: string } {
  const errors: { name?: string; code?: string; statusDate?: string } = {};
  const trimmedName = values.name.trim();
  if (trimmedName === '') {
    errors.name = 'Enter a schedule name';
  } else if (trimmedName.length > 80) {
    errors.name = 'Use 80 characters or fewer';
  }

  const trimmedCode = values.code.trim();
  if (trimmedCode === '') {
    errors.code = 'Enter a schedule code';
  } else if (!SCHEDULE_CODE_PATTERN.test(trimmedCode)) {
    errors.code = 'Use letters, numbers, ., - or _';
  } else if (trimmedCode.length > 24) {
    errors.code = 'Use 24 characters or fewer';
  } else if (isCodeTaken(existingCodes, trimmedCode)) {
    errors.code = 'This code is already used in this project';
  }

  if (values.badDate || (values.statusDate !== '' && !isIsoDate(values.statusDate))) {
    errors.statusDate = 'Enter a valid date';
  }

  return errors;
}

/**
 * The stepped schedule import dialog (spec §5.1, §6.4):
 * - File: pick project (from Home) and file, inspect in Web Worker
 * - Columns (xlsx/CSV only): options, column mapping and live "First 10 rows" preview
 * - Review: multi-project XER picker, Name/Code/Status date, live report view and commit
 */
export function ImportScheduleDialog({ projectId }: { projectId?: ID }): ReactElement {
  const { closeDialog, openDialog } = useDialogs();
  const { status, workspace, projects, project: currentProject } = useCurrentContext();
  const navigate = useNavigate();
  const location = useLocation();
  const parser = useImportParser();
  const importSchedule = useImportSchedule();

  const [step, setStep] = useState<ImportStepId>('file');
  const [chosenProjectId, setChosenProjectId] = useState<ID | null>(projectId ?? null);
  const [projectError, setProjectError] = useState<string | undefined>(undefined);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>(undefined);
  const [inspectState, setInspectState] = useState<FileInspectState>({ kind: 'idle' });
  const [inspected, setInspected] = useState<ValidInspect | null>(null);

  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [headerRowText, setHeaderRowText] = useState('1');
  const [hoursPerDayText, setHoursPerDayText] = useState('8');
  const [preview, setPreview] = useState<TablePreview>({ headers: [], rows: [] });
  const [previewPending, setPreviewPending] = useState(false);
  const [columnErrors, setColumnErrors] = useState<Partial<Record<ColumnErrorKey, string>>>({});

  const [analyzing, setAnalyzing] = useState(false);
  const [projectRows, setProjectRows] = useState<AnalyzedProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [scheduleName, setScheduleName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [scheduleCode, setScheduleCode] = useState('');
  const [codeError, setCodeError] = useState<string | undefined>(undefined);
  const [statusDate, setStatusDate] = useState('');
  const [statusDateError, setStatusDateError] = useState<string | undefined>(undefined);
  const [statusDateEdited, setStatusDateEdited] = useState(false);
  const [importAlert, setImportAlert] = useState<string | null>(null);
  const [alertFocusTick, setAlertFocusTick] = useState(0);
  const [importing, setImporting] = useState(false);

  const dropzoneRef = useRef<HTMLButtonElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const statusDateInputRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const inspectSeqRef = useRef(0);
  const previewSeqRef = useRef(0);
  const analyzeSeqRef = useRef(0);
  const submittingRef = useRef(false);
  const controlRefs = useRef<Partial<Record<ColumnErrorKey, HTMLElement | null>>>({});
  const modelsRef = useRef<Map<string, ImportModel>>(new Map());

  const registerControl = useCallback((key: ColumnErrorKey, node: HTMLElement | null) => {
    controlRefs.current[key] = node;
  }, []);

  useEffect(() => {
    if (alertFocusTick > 0) alertRef.current?.focus();
  }, [alertFocusTick]);

  const effectiveProjectId =
    chosenProjectId !== null && projects.some((p) => p.id === chosenProjectId)
      ? chosenProjectId
      : status === 'ready'
        ? defaultProjectId(projects, projectId, currentProject?.id)
        : (projectId ?? null);

  const selectedProject =
    projects.find((p) => p.id === effectiveProjectId) ??
    (currentProject?.id === effectiveProjectId ? currentProject : null);

  const { data: projectSchedules } = useProjectSchedules(effectiveProjectId ?? undefined);
  const existingCodes = useMemo(
    () =>
      projectSchedules?.flatMap((schedule) => (schedule.code === null ? [] : [schedule.code])) ??
      NO_CODES,
    [projectSchedules],
  );

  const { fallback: contextFallback, onOpenAutoFocus } = useScheduleDialogFallback({
    fields: [{ height: 36 }, { height: 140 }],
    focusForm: () => dropzoneRef.current?.focus(),
  });
  // When opened for a known project (Files page or tests), render the File step immediately.
  const fallback = projectId === undefined ? contextFallback : null;

  const isTable = inspected?.kind === 'table';
  const steps: readonly ImportStepId[] = isTable
    ? ['file', 'columns', 'review']
    : ['file', 'review'];

  const activeRow =
    selectedProjectId === null
      ? null
      : (projectRows.find((row) => row.project.id === selectedProjectId) ?? null);

  function applyRowDefaults(row: AnalyzedProjectRow | null, currentFile: File): void {
    setNameError(undefined);
    setCodeError(undefined);
    setStatusDateError(undefined);
    setStatusDateEdited(false);
    setImportAlert(null);
    if (row === null) {
      setScheduleName('');
      setScheduleCode('');
      setStatusDate('');
      return;
    }
    const defaultName =
      row.report.sourceProject.name?.trim() || scheduleNameFromFile(currentFile.name);
    const defaultCode = suggestImportCode(existingCodes, {
      sourceProjectCode: row.report.sourceProject.code,
      fileName: currentFile.name,
    });
    setScheduleName(defaultName);
    setScheduleCode(defaultCode);
    setStatusDate(row.initialStatusSource === 'none' ? '' : (row.report.statusDate.date ?? ''));
  }

  function handleFileChange(nextFile: File | null): void {
    inspectSeqRef.current += 1;
    previewSeqRef.current += 1;
    analyzeSeqRef.current += 1;
    const seq = inspectSeqRef.current;

    // Terminate any slow in-flight inspection before starting another (Review Focus 4).
    parser.cancel?.();
    modelsRef.current.clear();
    setFile(nextFile);
    setFileError(undefined);
    setInspected(null);
    setMapping(null);
    setPreview({ headers: [], rows: [] });
    setPreviewPending(false);
    setColumnErrors({});
    setAnalyzing(false);
    setProjectRows([]);
    setSelectedProjectId(null);
    setScheduleName('');
    setScheduleCode('');
    setStatusDate('');
    setNameError(undefined);
    setCodeError(undefined);
    setStatusDateError(undefined);
    setStatusDateEdited(false);
    setImportAlert(null);
    setStep('file');

    if (nextFile === null) {
      setInspectState({ kind: 'idle' });
      return;
    }

    const parsed = importFileSchema.safeParse(nextFile);
    if (!parsed.success) {
      setInspectState({ kind: 'idle' });
      setFileError(parsed.error.issues[0]?.message);
      return;
    }

    setInspectState({ kind: 'reading' });
    void parser.inspect(nextFile).then(
      (outcome) => {
        if (inspectSeqRef.current !== seq) return;
        if (outcome.kind === 'refused') {
          setInspectState({
            kind: 'refused',
            message: outcome.message,
            code: null,
            format: null,
            parserVersion: outcome.parserVersion,
          });
          return;
        }
        setInspected(outcome);
        setMapping(outcome.mapping);
        if (outcome.kind === 'table') {
          setPreview(outcome.preview);
          setHeaderRowText(String(outcome.mapping.table?.headerRow ?? 1));
          setHoursPerDayText(String(outcome.mapping.table?.hoursPerDay ?? 8));
        }
        setInspectState({
          kind: 'ready',
          formatLabel: formatDisplayName(
            outcome.format,
            outcome.kind === 'schedule' ? outcome.formatVersion : null,
          ),
        });
      },
      (error: unknown) => {
        if (inspectSeqRef.current !== seq || isCancelledError(error)) return;
        setInspectState({
          kind: 'refused',
          message: clientErrorMessage(error),
          code: null,
          format: null,
          parserVersion: null,
        });
      },
    );
  }

  function runPreview(nextTable: TableMapping, nextEncoding: TextEncodingName | null): void {
    if (
      !Number.isInteger(nextTable.headerRow) ||
      nextTable.headerRow < 1 ||
      nextTable.headerRow > 50
    ) {
      return;
    }
    previewSeqRef.current += 1;
    const seq = previewSeqRef.current;
    setPreviewPending(true);
    void parser.preview(nextTable, nextEncoding).then(
      (nextPreview) => {
        if (previewSeqRef.current !== seq) return;
        setPreview(nextPreview);
        setPreviewPending(false);
        setMapping((current) =>
          current?.table
            ? {
                ...current,
                table: {
                  ...current.table,
                  columns: refreshMappedHeaders(current.table.columns, nextPreview.headers),
                },
              }
            : current,
        );
      },
      (error: unknown) => {
        if (previewSeqRef.current !== seq || isCancelledError(error)) return;
        setPreviewPending(false);
      },
    );
  }

  function updateTable(patch: Partial<TableMapping>, nextEncoding?: TextEncodingName): void {
    if (mapping === null || mapping.table === null) return;
    const updatedTable: TableMapping = { ...mapping.table, ...patch };
    const updatedEncoding = nextEncoding ?? mapping.encoding;
    setMapping({ ...mapping, encoding: updatedEncoding, table: updatedTable });
    if (Object.keys(columnErrors).length > 0) setColumnErrors({});
    runPreview(updatedTable, updatedEncoding);
  }

  function handleEncodingChange(nextEncoding: TextEncodingName): void {
    updateTable({}, nextEncoding);
  }

  function handleHeaderRowChange(text: string): void {
    setHeaderRowText(text);
    const trimmed = text.trim();
    const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    updateTable({ headerRow: parsed });
  }

  function handleHoursPerDayChange(text: string): void {
    setHoursPerDayText(text);
    const trimmed = text.trim();
    const parsed = trimmed === '' ? Number.NaN : Number(trimmed.replace(',', '.'));
    if (mapping === null || mapping.table === null) return;
    const updatedTable: TableMapping = { ...mapping.table, hoursPerDay: parsed };
    setMapping({ ...mapping, table: updatedTable });
    if (Object.keys(columnErrors).length > 0) setColumnErrors({});
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 24) {
      runPreview(updatedTable, mapping.encoding);
    }
  }

  function handleColumnChange(
    field: ImportField,
    column: { index: number; header: string } | null,
  ): void {
    if (mapping === null || mapping.table === null) return;
    const nextColumns = { ...mapping.table.columns };
    if (column === null) delete nextColumns[field];
    else nextColumns[field] = column;
    updateTable({ columns: nextColumns });
  }

  async function enterReview(
    targetMapping: ImportMapping,
    currentInspected: ValidInspect,
    currentFile: File,
    fromStep: 'file' | 'columns',
  ): Promise<void> {
    analyzeSeqRef.current += 1;
    const seq = analyzeSeqRef.current;
    setAnalyzing(true);
    setImportAlert(null);

    const handleRefusal = (message: string): void => {
      setAnalyzing(false);
      if (fromStep === 'file') {
        setInspectState({
          kind: 'refused',
          message,
          code: null,
          format: null,
          parserVersion: null,
        });
      } else {
        toast.error(message);
      }
    };

    try {
      const rows: AnalyzedProjectRow[] = [];
      const nextModels = new Map<string, ImportModel>();
      if (
        currentInspected.kind === 'schedule' &&
        currentInspected.format === 'xer' &&
        currentInspected.projects.length > 1
      ) {
        for (const project of orderXerProjects(currentInspected.projects)) {
          const outcome = await parser.analyze(
            { ...targetMapping, sourceProjectId: project.id },
            { statusDate: null },
          );
          if (analyzeSeqRef.current !== seq) return;
          if (outcome.kind === 'refused') {
            handleRefusal(outcome.message);
            return;
          }
          nextModels.set(project.id, outcome.model);
          rows.push({
            project,
            report: outcome.report,
            firstActivities: outcome.model.activities.slice(0, 5).map((a) => a.name),
            initialStatusSource: outcome.report.statusDate.source,
          });
        }
      } else {
        const outcome = await parser.analyze(targetMapping, { statusDate: null });
        if (analyzeSeqRef.current !== seq) return;
        if (outcome.kind === 'refused') {
          handleRefusal(outcome.message);
          return;
        }
        const singleProject =
          currentInspected.kind === 'schedule' && currentInspected.projects.length === 1
            ? currentInspected.projects[0]!
            : {
                id: outcome.report.sourceProject.id ?? '__single__',
                code: outcome.report.sourceProject.code,
                name: outcome.report.sourceProject.name,
                exportFlag: true,
                baselineOf: null,
              };
        nextModels.set(singleProject.id, outcome.model);
        rows.push({
          project: singleProject,
          report: outcome.report,
          firstActivities: outcome.model.activities.slice(0, 5).map((a) => a.name),
          initialStatusSource: outcome.report.statusDate.source,
        });
      }

      const chosenId = pickDefaultProjectId(rows);
      const chosenIndex = rows.findIndex((row) => row.project.id === chosenId);
      const chosenRow = chosenIndex >= 0 ? rows[chosenIndex]! : null;
      const nextMapping: ImportMapping =
        currentInspected.kind === 'schedule' &&
        currentInspected.format === 'xer' &&
        chosenId !== null
          ? { ...targetMapping, sourceProjectId: chosenId }
          : targetMapping;

      // When the file has no status date and the project has one, run the checks against the
      // project's status date so the stored checks match the schedule (D37) while keeping the
      // Status date field empty and its "Not in the file…" hint.
      if (
        chosenRow !== null &&
        chosenRow.initialStatusSource === 'none' &&
        selectedProject?.statusDate != null
      ) {
        const rechecked = await parser.analyze(nextMapping, {
          statusDate: selectedProject.statusDate,
        });
        if (analyzeSeqRef.current !== seq) return;
        if (rechecked.kind === 'analyzed') {
          nextModels.set(chosenRow.project.id, rechecked.model);
          rows[chosenIndex] = { ...chosenRow, report: rechecked.report };
        }
      }

      modelsRef.current = nextModels;
      setMapping(nextMapping);
      setProjectRows(rows);
      setSelectedProjectId(chosenId);
      applyRowDefaults(chosenIndex >= 0 ? rows[chosenIndex]! : null, currentFile);
      setStep('review');
      setAnalyzing(false);
    } catch (error) {
      if (analyzeSeqRef.current !== seq || isCancelledError(error)) return;
      setAnalyzing(false);
      toast.error(clientErrorMessage(error));
    }
  }

  function handleSelectProject(nextId: string): void {
    if (file === null || mapping === null) return;
    const row = projectRows.find((item) => item.project.id === nextId) ?? null;
    if (row === null || row.report.issueTotals.error > 0) return;
    setSelectedProjectId(nextId);
    if (inspected?.kind === 'schedule' && inspected.format === 'xer') {
      setMapping({ ...mapping, sourceProjectId: nextId });
    }
    applyRowDefaults(row, file);
  }

  function currentAnalyzeStatusDate(edited: boolean, fieldValue: string): ISODate | null {
    if (!edited) return null;
    if (fieldValue === '') return selectedProject?.statusDate ?? null;
    return isIsoDate(fieldValue) ? fieldValue : null;
  }

  function handleStatusDateChange(value: string): void {
    setStatusDate(value);
    setStatusDateError(undefined);
    setStatusDateEdited(true);
    if (activeRow === null || mapping === null) return;
    if (value !== '' && !isIsoDate(value)) return;

    const targetId = activeRow.project.id;
    const rowMapping: ImportMapping =
      inspected?.kind === 'schedule' && inspected.format === 'xer'
        ? { ...mapping, sourceProjectId: targetId }
        : mapping;
    const effectiveDate: ISODate | null =
      value === '' ? (selectedProject?.statusDate ?? null) : value;

    analyzeSeqRef.current += 1;
    const seq = analyzeSeqRef.current;
    void parser.analyze(rowMapping, { statusDate: effectiveDate }).then(
      (outcome) => {
        if (analyzeSeqRef.current !== seq || outcome.kind !== 'analyzed') return;
        modelsRef.current.set(targetId, outcome.model);
        setProjectRows((rows) =>
          rows.map((row) =>
            row.project.id === targetId ? { ...row, report: outcome.report } : row,
          ),
        );
        if (outcome.report.issueTotals.error === 0) setImportAlert(null);
      },
      (error: unknown) => {
        if (analyzeSeqRef.current !== seq || isCancelledError(error)) return;
        toast.error(clientErrorMessage(error));
      },
    );
  }

  function handleActivityCodeFieldChange(field: string): void {
    if (mapping === null || activeRow === null) return;
    const nextMapping: ImportMapping = { ...mapping, activityCodeField: field };
    const targetId = activeRow.project.id;
    setMapping(nextMapping);
    analyzeSeqRef.current += 1;
    const seq = analyzeSeqRef.current;
    const statusDateOption = currentAnalyzeStatusDate(statusDateEdited, statusDate);

    void parser.analyze(nextMapping, { statusDate: statusDateOption }).then(
      (outcome) => {
        if (analyzeSeqRef.current !== seq || outcome.kind !== 'analyzed') return;
        modelsRef.current.set(targetId, outcome.model);
        setProjectRows((rows) =>
          rows.map((row) =>
            row.project.id === targetId
              ? {
                  ...row,
                  report: outcome.report,
                  firstActivities: outcome.model.activities.slice(0, 5).map((a) => a.name),
                }
              : row,
          ),
        );
        if (outcome.report.issueTotals.error === 0) setImportAlert(null);
      },
      (error: unknown) => {
        if (analyzeSeqRef.current !== seq || isCancelledError(error)) return;
        toast.error(clientErrorMessage(error));
      },
    );
  }

  function handleReviewEncodingChange(encoding: TextEncodingName): void {
    if (mapping === null || inspected?.kind !== 'schedule' || inspected.format !== 'xer') return;
    const nextMapping: ImportMapping = { ...mapping, encoding };
    const rowsSnapshot = projectRows;
    const activeId = selectedProjectId;
    const activeDateOption = currentAnalyzeStatusDate(statusDateEdited, statusDate);
    setMapping(nextMapping);

    analyzeSeqRef.current += 1;
    const seq = analyzeSeqRef.current;

    void (async () => {
      try {
        const updated: AnalyzedProjectRow[] = [];
        const nextModels = new Map(modelsRef.current);
        for (const row of rowsSnapshot) {
          const outcome = await parser.analyze(
            { ...nextMapping, sourceProjectId: row.project.id },
            { statusDate: row.project.id === activeId ? activeDateOption : null },
          );
          if (analyzeSeqRef.current !== seq) return;
          if (outcome.kind !== 'analyzed') return;
          nextModels.set(row.project.id, outcome.model);
          updated.push({
            ...row,
            project: {
              ...row.project,
              name: outcome.report.sourceProject.name ?? row.project.name,
            },
            report: outcome.report,
            firstActivities: outcome.model.activities.slice(0, 5).map((a) => a.name),
          });
        }
        modelsRef.current = nextModels;
        setProjectRows(updated);
      } catch (error) {
        if (analyzeSeqRef.current !== seq || isCancelledError(error)) return;
        toast.error(clientErrorMessage(error));
      }
    })();
  }

  function handleFileNext(): void {
    if (effectiveProjectId === null) {
      setProjectError('Choose a project');
      return;
    }
    if (file === null) {
      setFileError('Choose a file to import');
      dropzoneRef.current?.focus();
      return;
    }
    if (inspected === null || mapping === null || analyzing) return;
    if (inspected.kind === 'table') {
      setStep('columns');
    } else {
      void enterReview(mapping, inspected, file, 'file');
    }
  }

  function handleColumnsNext(): void {
    if (mapping?.table == null || inspected === null || file === null || analyzing) return;
    const errors = checkColumns(mapping.table);
    if (Object.keys(errors).length > 0) {
      setColumnErrors(errors);
      const firstKey = COLUMN_ERROR_ORDER.find((key) => errors[key] !== undefined);
      if (firstKey !== undefined) controlRefs.current[firstKey]?.focus();
      return;
    }
    setColumnErrors({});
    void enterReview(mapping, inspected, file, 'columns');
  }

  async function handleReviewSubmit(): Promise<void> {
    if (submittingRef.current || analyzing) return;

    if (projectRows.length > 1 && selectedProjectId === null) {
      setImportAlert(CHOOSE_SCHEDULE_MESSAGE);
      setAlertFocusTick((tick) => tick + 1);
      return;
    }
    if (activeRow === null) return;
    if (activeRow.report.issueTotals.error > 0) {
      setImportAlert(BLOCKED_ERRORS_MESSAGE);
      setAlertFocusTick((tick) => tick + 1);
      return;
    }
    setImportAlert(null);

    const badDate = statusDateInputRef.current?.validity.badInput === true;
    const errors = validateReviewFields(
      { name: scheduleName, code: scheduleCode, statusDate, badDate },
      existingCodes,
    );
    setNameError(errors.name);
    setCodeError(errors.code);
    setStatusDateError(errors.statusDate);
    if (errors.name !== undefined) {
      nameInputRef.current?.focus();
      return;
    }
    if (errors.code !== undefined) {
      codeInputRef.current?.focus();
      return;
    }
    if (errors.statusDate !== undefined) {
      statusDateInputRef.current?.focus();
      return;
    }

    if (effectiveProjectId === null || file === null || mapping === null) return;

    const commitMapping: ImportMapping =
      inspected?.kind === 'schedule' && inspected.format === 'xer'
        ? { ...mapping, sourceProjectId: activeRow.project.id }
        : mapping;
    const activityCount =
      activeRow.report.counts.find((count) => count.entity === 'activity')?.accepted ?? 0;
    const submittedStatusDate: ISODate | null = statusDate === '' ? null : statusDate;
    const effectiveStatusDate: ISODate | null =
      submittedStatusDate ?? selectedProject?.statusDate ?? null;

    submittingRef.current = true;
    setImporting(true);
    try {
      let activeModel = modelsRef.current.get(activeRow.project.id);
      if (activeModel === undefined) {
        const analyzed = await parser.analyze(commitMapping, { statusDate: effectiveStatusDate });
        if (analyzed.kind !== 'analyzed') {
          throw new Error(analyzed.message);
        }
        activeModel = analyzed.model;
      }
      const [packed, snapshot] = await Promise.all([
        parser.pack(activeRow.report),
        packSnapshot(activeModel, effectiveStatusDate),
      ]);
      const created = await importSchedule.mutateAsync({
        projectId: effectiveProjectId,
        name: scheduleName.trim(),
        code: scheduleCode.trim(),
        file,
        stored: packed.stored,
        dataStored: snapshot.dataStored,
        calculationMode: snapshot.calculationMode,
        statusDate: submittedStatusDate,
        activityCount,
        sourceProjectCode: activeRow.report.sourceProject.code,
        mapping: commitMapping,
        report: packed.report,
      });
      toast.success('Schedule imported', {
        action: {
          label: 'View report',
          onClick: () =>
            openDialog('importReport', {
              projectId: created.projectId,
              scheduleId: created.id,
            }),
        },
      });
      closeDialog();
      const parent =
        projects.find((p) => p.id === created.projectId) ??
        (currentProject?.id === created.projectId ? currentProject : null);
      // Already on that files page: stay, keeping its search (Show archived, D16).
      const target = parent ? filesPath(parent.workspaceId, parent.id) : null;
      if (target !== null && location.pathname !== target) void navigate(target);
    } catch (error) {
      // Only a failure re-arms the form; after a success the dialog is closing.
      submittingRef.current = false;
      setImporting(false);
      if (error instanceof RepositoryError && error.code === 'conflict') {
        setCodeError(error.message);
        codeInputRef.current?.focus();
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  function handleBack(): void {
    analyzeSeqRef.current += 1;
    setAnalyzing(false);
    setImportAlert(null);
    setStep(step === 'review' && isTable ? 'columns' : 'file');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (step === 'file') handleFileNext();
    else if (step === 'columns') handleColumnsNext();
    else void handleReviewSubmit();
  }

  const meta = STEP_META[step];
  const reading = inspectState.kind === 'reading';
  const fileBusy = reading || analyzing;
  const fileNextDisabled =
    fileBusy || inspectState.kind === 'refused' || (file !== null && inspected === null);
  const columnsBusy = previewPending || analyzing;

  const targetLine =
    workspace !== null && selectedProject !== null
      ? `Into ${workspace.name} › ${selectedProject.code} ${selectedProject.name}`
      : null;

  const headerNode =
    fallback === null ? (
      <div className="flex flex-col gap-1">
        {targetLine !== null && <p className="text-xs text-muted-foreground">{targetLine}</p>}
        <ImportStepper steps={steps} current={step} />
      </div>
    ) : undefined;

  return (
    <FormDialog
      title="Import schedule"
      description={meta.description}
      header={headerNode}
      width={meta.width}
      isDirty={file !== null}
      isPending={importing}
      submitLabel={step === 'review' ? 'Import' : 'Next'}
      pendingLabel="Importing…"
      onSubmit={handleSubmit}
      onClose={closeDialog}
      onOpenAutoFocus={projectId === undefined ? onOpenAutoFocus : undefined}
      footer={
        fallback?.footer ??
        (({ requestClose }) => (
          <>
            {step === 'file' ? (
              <Button type="button" variant="secondary" disabled={analyzing} onClick={requestClose}>
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                disabled={analyzing || importing}
                onClick={handleBack}
              >
                Back
              </Button>
            )}
            {step === 'file' && (
              <Button type="submit" disabled={fileNextDisabled}>
                {fileBusy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {reading ? 'Reading file…' : analyzing ? 'Checking…' : 'Next'}
              </Button>
            )}
            {step === 'columns' && (
              <Button type="submit" disabled={columnsBusy}>
                {columnsBusy && <Loader2 className="animate-spin" aria-hidden="true" />}
                {columnsBusy ? 'Checking…' : 'Next'}
              </Button>
            )}
            {step === 'review' && (
              <Button type="submit" disabled={analyzing || importing}>
                {importing && <Loader2 className="animate-spin" aria-hidden="true" />}
                {importing ? 'Importing…' : 'Import'}
              </Button>
            )}
          </>
        ))
      }
    >
      {fallback ? (
        fallback.body
      ) : step === 'file' ? (
        <FileStep
          showProjectPicker={projectId === undefined}
          projectId={effectiveProjectId}
          onProjectChange={(id) => {
            setChosenProjectId(id);
            setProjectError(undefined);
          }}
          projectError={projectError}
          file={file}
          fileError={fileError}
          onFileChange={handleFileChange}
          inspectState={inspectState}
          dropzoneRef={dropzoneRef}
        />
      ) : step === 'columns' && inspected?.kind === 'table' && mapping?.table != null ? (
        <ColumnsStep
          format={inspected.format}
          fileName={inspected.fileName}
          sheets={inspected.sheets}
          detectedEncoding={inspected.encoding}
          encoding={mapping.encoding}
          table={mapping.table}
          headerRowText={headerRowText}
          hoursPerDayText={hoursPerDayText}
          preview={preview}
          errors={columnErrors}
          onEncodingChange={handleEncodingChange}
          onHeaderRowChange={handleHeaderRowChange}
          onHoursPerDayChange={handleHoursPerDayChange}
          onTableChange={(patch) => updateTable(patch)}
          onColumnChange={handleColumnChange}
          registerControl={registerControl}
        />
      ) : step === 'review' && file !== null ? (
        <ReviewStep
          file={file}
          projectRows={projectRows}
          selectedProjectId={selectedProjectId}
          onSelectProject={handleSelectProject}
          activeRow={activeRow}
          name={scheduleName}
          onNameChange={(value) => {
            setScheduleName(value);
            if (nameError !== undefined) setNameError(undefined);
          }}
          nameError={nameError}
          nameInputRef={nameInputRef}
          code={scheduleCode}
          onCodeChange={(value) => {
            setScheduleCode(value);
            if (codeError !== undefined) setCodeError(undefined);
          }}
          codeError={codeError}
          codeInputRef={codeInputRef}
          statusDate={statusDate}
          onStatusDateChange={handleStatusDateChange}
          statusDateError={statusDateError}
          statusDateInputRef={statusDateInputRef}
          importAlert={importAlert}
          alertRef={alertRef}
          codeFields={inspected?.kind === 'schedule' ? inspected.codeFields : undefined}
          onActivityCodeField={
            inspected?.kind === 'schedule' && inspected.format === 'mspdi'
              ? handleActivityCodeFieldChange
              : undefined
          }
          onEncoding={
            inspected?.kind === 'schedule' && inspected.format === 'xer'
              ? handleReviewEncodingChange
              : undefined
          }
          disabled={importing}
        />
      ) : null}
    </FormDialog>
  );
}
