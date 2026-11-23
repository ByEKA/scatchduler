import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { DialogShell, FormDialog } from '@/components/common/FormDialog';
import { SectionError } from '@/components/common/SectionError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RepositoryError } from '@/data/errors';
import type { Folder, ID, Schedule } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { isCodeTaken, suggestCopyCode } from '@/features/files/codes';
import { SCHEDULE_CODE_HINT } from '@/features/schedules/schedule-schema';
import { useProjectFolders } from '@/hooks/useFolders';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useCopySchedule } from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';

const UNFILED_VALUE = '__unfiled__';

function makeCopyScheduleSchema(taken: readonly string[]) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter a schedule name')
      .max(80, 'Use 80 characters or fewer'),
    code: z
      .string()
      .trim()
      .min(1, 'Enter a schedule code')
      .regex(/^[A-Za-z0-9_.-]*$/, 'Use letters, numbers, ., - or _')
      .max(24, 'Use 24 characters or fewer')
      .refine((code) => !isCodeTaken(taken, code), 'This code is already used in this project'),
    folderId: z.string(),
  });
}

type CopyScheduleFormValues = z.infer<ReturnType<typeof makeCopyScheduleSchema>>;

function defaultCopyName(sourceName: string): string {
  const suffix = ' (copy)';
  const base = sourceName.trim().slice(0, 80 - suffix.length);
  return `${base}${suffix}`;
}

function CopyScheduleForm({
  schedule,
  schedules,
  folders,
}: {
  schedule: Schedule;
  schedules: readonly Schedule[];
  folders: readonly Folder[];
}): ReactElement {
  const { closeDialog } = useDialogs();
  const copySchedule = useCopySchedule();

  const nameId = useId();
  const nameErrorId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  const folderSelectId = useId();

  const submittingRef = useRef(false);

  const takenCodes = useMemo(
    () => schedules.flatMap((item) => (item.code !== null ? [item.code] : [])),
    [schedules],
  );
  const takenCodesRef = useRef<readonly string[]>(takenCodes);

  useLayoutEffect(() => {
    takenCodesRef.current = takenCodes;
  }, [takenCodes]);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<CopyScheduleFormValues>({
    resolver: (values, context, options) =>
      zodResolver(makeCopyScheduleSchema(takenCodesRef.current))(values, context, options),
    defaultValues: {
      name: defaultCopyName(schedule.name),
      code: suggestCopyCode(takenCodes, schedule.code),
      folderId: schedule.folderId ?? UNFILED_VALUE,
    },
  });

  const isPending = isSubmitting || copySchedule.isPending;

  async function save(values: CopyScheduleFormValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await copySchedule.mutateAsync({
        scheduleId: schedule.id,
        name: values.name,
        code: values.code,
        folderId: values.folderId === UNFILED_VALUE ? null : values.folderId,
      });
      toast.success('Schedule duplicated');
      closeDialog();
    } catch (error) {
      submittingRef.current = false;
      if (error instanceof RepositoryError && error.code === 'conflict') {
        setError('code', { type: 'conflict', message: error.message }, { shouldFocus: true });
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(save)(event);
  }

  const nameError = errors.name?.message;
  const codeError = errors.code?.message;

  return (
    <FormDialog
      title="Duplicate schedule"
      description={`Create a copy of ${schedule.name} in this project.`}
      width="md"
      isDirty={isDirty}
      isPending={isPending}
      submitLabel="Duplicate schedule"
      pendingLabel="Duplicating…"
      onSubmit={onSubmit}
      onClose={closeDialog}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        setFocus('name', { shouldSelect: true });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} className="text-xs font-semibold">
          Name
        </Label>
        <Input
          id={nameId}
          autoComplete="off"
          aria-required="true"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? nameErrorId : undefined}
          readOnly={isPending}
          {...register('name')}
        />
        {nameError && (
          <p id={nameErrorId} className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={codeId} className="text-xs font-semibold">
          Code
        </Label>
        <Input
          id={codeId}
          autoComplete="off"
          spellCheck={false}
          aria-required="true"
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? `${codeHintId} ${codeErrorId}` : codeHintId}
          readOnly={isPending}
          className="font-mono"
          {...register('code')}
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={folderSelectId} className="text-xs font-semibold">
          Folder
        </Label>
        <select
          id={folderSelectId}
          disabled={isPending}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
          {...register('folderId')}
        >
          <option value={UNFILED_VALUE}>Unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </div>
    </FormDialog>
  );
}

/**
 * "Duplicate schedule" dialog (P4 later spec §7.2.4, R6, S7): copies a schedule's metadata,
 * snapshot document and import report into a new schedule in the same project.
 */
export function CopyScheduleDialog({
  projectId,
  scheduleId,
}: {
  projectId: ID;
  scheduleId: ID;
}): ReactElement {
  const { closeDialog } = useDialogs();
  const schedules = useProjectSchedules(projectId);
  const folders = useProjectFolders(projectId);
  const schedule = schedules.data?.find((item) => item.id === scheduleId);

  if (schedules.data !== undefined && schedule !== undefined) {
    return (
      <CopyScheduleForm
        key={schedule.id}
        schedule={schedule}
        schedules={schedules.data}
        folders={folders.data ?? []}
      />
    );
  }

  if (schedules.isError) {
    return (
      <DialogShell title="Duplicate schedule" width="md" onCloseRequest={closeDialog}>
        <SectionError
          error={schedules.error}
          onRetry={() => void schedules.refetch()}
          className="py-6"
        />
      </DialogShell>
    );
  }

  return (
    <DialogShell title="Duplicate schedule" width="md" onCloseRequest={closeDialog}>
      <div className="py-6 text-sm text-muted-foreground">Loading schedule…</div>
    </DialogShell>
  );
}
