import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useLayoutEffect, useRef } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FileDropzone } from '@/components/common/FileDropzone';
import { FormDialog } from '@/components/common/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ID } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { ProjectField } from '@/features/schedules/ProjectCombobox';
import {
  defaultProjectId,
  importScheduleSchema,
  MAX_SCHEDULE_BYTES,
  SCHEDULE_EXTENSIONS,
  scheduleNameFromFile,
  schedulePath,
  type ImportScheduleValues,
} from '@/features/schedules/schedule-schema';
import { useScheduleDialogFallback } from '@/features/schedules/useScheduleDialogFallback';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useImportSchedule } from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';

const FILE_HINT = 'Primavera P6 (.xer), MS Project XML (.xml) or CSV · up to 20 MB';
const DROPZONE_HEIGHT = 140;
// The fields in the order the form shows them. Name registers during the form's own render, before
// the two Controllers below it, so react-hook-form's own error focus would skip the file.
const FIELD_ORDER = ['file', 'name', 'projectId'] as const;

/**
 * Imports a schedule file into a project and opens the new schedule (spec §6.7). Phase 1 keeps
 * the file's name only. The project defaults like New schedule's.
 */
export function ImportScheduleDialog({ projectId }: { projectId?: ID }): ReactElement {
  const { closeDialog } = useDialogs();
  const { status, projects, project } = useCurrentContext();
  const navigate = useNavigate();
  const importSchedule = useImportSchedule();
  const nameId = useId();
  const nameErrorId = useId();
  // Drops a second submit that arrives before the pending state has rendered.
  const submittingRef = useRef(false);
  const initialProjectId =
    status === 'ready' ? defaultProjectId(projects, projectId, project?.id) : null;
  const {
    register,
    control,
    handleSubmit,
    getValues,
    setValue,
    resetField,
    setFocus,
    formState: { errors, isDirty, isSubmitting, isSubmitted },
  } = useForm({
    resolver: zodResolver(importScheduleSchema),
    defaultValues: { file: null, name: '', projectId: initialProjectId ?? '' },
    shouldFocusError: false,
  });
  const { fallback, onOpenAutoFocus } = useScheduleDialogFallback({
    fieldHeights: [DROPZONE_HEIGHT, 36, 36],
    focusForm: () => setFocus('file'),
  });
  const isPending = isSubmitting || importSchedule.isPending;

  // The project must be one the picker offers. Opened while the projects were loading, the form
  // has none yet; after a workspace change (Back or Forward while the dialog is open) it holds a
  // project of the old workspace. Either way it starts over on the default project, before paint,
  // so the picker never shows "Select project". A project picked from the list is kept.
  useLayoutEffect(() => {
    if (initialProjectId === null) return;
    const current = getValues('projectId');
    if (!projects.some((p) => p.id === current)) {
      resetField('projectId', { defaultValue: initialProjectId });
    }
  }, [initialProjectId, projects, getValues, resetField]);

  /** Keeps the chosen file and fills an empty Name from its file name. */
  function chooseFile(file: File | null, onChange: (file: File | null) => void): void {
    onChange(file);
    if (file === null || getValues('name').trim() !== '') return;
    setValue('name', scheduleNameFromFile(file.name), {
      shouldDirty: true,
      // After a submit, fields check themselves as they change; before it, they stay quiet.
      shouldValidate: isSubmitted,
    });
  }

  async function save(values: ImportScheduleValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const schedule = await importSchedule.mutateAsync(values);
      toast.success('Schedule imported');
      closeDialog();
      // The picker offers only these projects, so the new schedule's project is among them.
      const parent = projects.find((p) => p.id === schedule.projectId);
      if (parent) void navigate(schedulePath(parent.workspaceId, parent.id, schedule.id));
    } catch (error) {
      // Only a failure re-arms the form; after a success the dialog is closing.
      submittingRef.current = false;
      toast.error(errorMessage(error));
    }
  }

  function focusFirstError(fieldErrors: FieldErrors): void {
    const first = FIELD_ORDER.find((name) => fieldErrors[name] !== undefined);
    if (first) setFocus(first);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(save, focusFirstError)(event);
  }

  const nameError = errors.name?.message;

  return (
    <FormDialog
      title="Import schedule"
      description="Upload a schedule exported from your planning tool."
      width="lg"
      isDirty={isDirty}
      isPending={isPending}
      submitLabel="Import"
      pendingLabel="Importing…"
      onSubmit={onSubmit}
      onClose={closeDialog}
      onOpenAutoFocus={onOpenAutoFocus}
      footer={fallback?.footer}
    >
      {fallback ? (
        fallback.body
      ) : (
        <>
          <Controller
            control={control}
            name="file"
            render={({ field, fieldState }) => (
              <FileDropzone
                ref={field.ref}
                label="Schedule file"
                accept={[...SCHEDULE_EXTENSIONS]}
                maxBytes={MAX_SCHEDULE_BYTES}
                hint={FILE_HINT}
                height={DROPZONE_HEIGHT}
                value={field.value ?? null}
                onChange={(file) => chooseFile(file, field.onChange)}
                error={fieldState.error?.message}
                disabled={isPending}
              />
            )}
          />
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
          <Controller
            control={control}
            name="projectId"
            render={({ field, fieldState }) => (
              <ProjectField
                ref={field.ref}
                value={field.value === '' ? null : field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
                disabled={isPending}
              />
            )}
          />
        </>
      )}
    </FormDialog>
  );
}
