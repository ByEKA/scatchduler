import { Check, Loader2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { FormDialog, type DialogWidth } from '@/components/common/FormDialog';
import { Button } from '@/components/ui/button';
import type { ID, ImportField, ImportMapping, TableMapping, TextEncodingName } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { ColumnsStep } from '@/features/import/ColumnsStep';
import { FileStep, type FileInspectState } from '@/features/import/FileStep';
import {
  checkColumns,
  formatDisplayName,
  IMPORT_FIELD_ORDER,
  type ColumnErrorKey,
} from '@/features/import/import-schema';
import { defaultProjectId, importFileSchema } from '@/features/schedules/schedule-schema';
import { useScheduleDialogFallback } from '@/features/schedules/useScheduleDialogFallback';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useImportParser, type InspectOutcome, type TablePreview } from '@/hooks/useImportParser';
import { cn } from '@/lib/utils';

type ImportStepId = 'file' | 'columns' | 'review';
type ValidInspect = Exclude<InspectOutcome, { kind: 'refused' }>;

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

/**
 * The stepped schedule import dialog (spec §5.1, §6.4):
 * - File: pick project (from Home) and file, inspect in Web Worker
 * - Columns (xlsx/CSV only): options, column mapping and live "First 10 rows" preview
 * - Review (Task 23): analyze, report view and commit
 */
export function ImportScheduleDialog({ projectId }: { projectId?: ID }): ReactElement {
  const { closeDialog } = useDialogs();
  const { status, workspace, projects, project: currentProject } = useCurrentContext();
  const parser = useImportParser();

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

  const dropzoneRef = useRef<HTMLButtonElement>(null);
  const inspectSeqRef = useRef(0);
  const previewSeqRef = useRef(0);
  const controlRefs = useRef<Partial<Record<ColumnErrorKey, HTMLElement | null>>>({});

  const registerControl = useCallback((key: ColumnErrorKey, node: HTMLElement | null) => {
    controlRefs.current[key] = node;
  }, []);

  const effectiveProjectId =
    chosenProjectId !== null && projects.some((p) => p.id === chosenProjectId)
      ? chosenProjectId
      : status === 'ready'
        ? defaultProjectId(projects, projectId, currentProject?.id)
        : (projectId ?? null);

  const selectedProject = projects.find((p) => p.id === effectiveProjectId) ?? null;

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

  function handleFileChange(nextFile: File | null): void {
    inspectSeqRef.current += 1;
    previewSeqRef.current += 1;
    const seq = inspectSeqRef.current;

    // Terminate any slow in-flight inspection before starting another (Review Focus 4).
    parser.cancel?.();
    setFile(nextFile);
    setFileError(undefined);
    setInspected(null);
    setMapping(null);
    setPreview({ headers: [], rows: [] });
    setPreviewPending(false);
    setColumnErrors({});
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
    if (inspected === null) return;
    if (inspected.kind === 'table') {
      setStep('columns');
    } else {
      setStep('review');
    }
  }

  function handleColumnsNext(): void {
    if (mapping?.table == null) return;
    const errors = checkColumns(mapping.table);
    if (Object.keys(errors).length > 0) {
      setColumnErrors(errors);
      const firstKey = COLUMN_ERROR_ORDER.find((key) => errors[key] !== undefined);
      if (firstKey !== undefined) controlRefs.current[firstKey]?.focus();
      return;
    }
    setColumnErrors({});
    setStep('review');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (step === 'file') handleFileNext();
    else if (step === 'columns') handleColumnsNext();
  }

  const meta = STEP_META[step];
  const reading = inspectState.kind === 'reading';
  const fileNextDisabled =
    reading || inspectState.kind === 'refused' || (file !== null && inspected === null);

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
      isPending={false}
      submitLabel={step === 'review' ? 'Import' : 'Next'}
      pendingLabel="Reading file…"
      onSubmit={handleSubmit}
      onClose={closeDialog}
      onOpenAutoFocus={projectId === undefined ? onOpenAutoFocus : undefined}
      footer={
        fallback?.footer ??
        (({ requestClose }) => (
          <>
            {step === 'file' ? (
              <Button type="button" variant="secondary" onClick={requestClose}>
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setStep(step === 'review' && isTable ? 'columns' : 'file')}
              >
                Back
              </Button>
            )}
            {step === 'file' && (
              <Button type="submit" disabled={fileNextDisabled}>
                {reading && <Loader2 className="animate-spin" aria-hidden="true" />}
                {reading ? 'Reading file…' : 'Next'}
              </Button>
            )}
            {step === 'columns' && (
              <Button type="submit" disabled={previewPending}>
                {previewPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                {previewPending ? 'Checking…' : 'Next'}
              </Button>
            )}
            {step === 'review' && (
              <Button type="submit" disabled>
                Import
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
      ) : null}
    </FormDialog>
  );
}
