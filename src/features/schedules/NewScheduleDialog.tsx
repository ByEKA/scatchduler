import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useLayoutEffect, useRef } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FormDialog } from '@/components/common/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RepositoryError } from '@/data/errors';
import type { ID } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { suggestNewScheduleCode } from '@/features/files/codes';
import { ProjectField } from '@/features/schedules/ProjectCombobox';
import {
  defaultProjectId,
  filesPath,
  newScheduleSchema,
  SCHEDULE_CODE_HINT,
  type NewScheduleValues,
} from '@/features/schedules/schedule-schema';
import { useScheduleDialogFallback } from '@/features/schedules/useScheduleDialogFallback';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useCreateSchedule } from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';

/**
 * Creates a blank schedule and opens its project's files page (spec §6.7; P3 core spec §6.4,
 * D16). The project starts as `projectId`, else the current project, else the workspace's first
 * project; without projects the dialog asks for one first. The code starts as the first free
 * `S` code; until the dialog knows the project's codes (Task 20), the server answers a taken one.
 */
export function NewScheduleDialog({ projectId }: { projectId?: ID }): ReactElement {
  const { closeDialog } = useDialogs();
  const { status, projects, project } = useCurrentContext();
  const navigate = useNavigate();
  const createSchedule = useCreateSchedule();
  const nameId = useId();
  const nameErrorId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  // Drops a second submit that arrives before the pending state has rendered.
  const submittingRef = useRef(false);
  const initialProjectId =
    status === 'ready' ? defaultProjectId(projects, projectId, project?.id) : null;
  const {
    register,
    control,
    handleSubmit,
    getValues,
    resetField,
    setError,
    setFocus,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(newScheduleSchema),
    defaultValues: {
      name: 'New schedule',
      code: suggestNewScheduleCode([]),
      projectId: initialProjectId ?? '',
    },
  });
  const { fallback, onOpenAutoFocus } = useScheduleDialogFallback({
    fields: [{ height: 36 }, { height: 36, hint: true }, { height: 36 }],
    // The default name is selected, so typing replaces it.
    focusForm: () => setFocus('name', { shouldSelect: true }),
  });
  const isPending = isSubmitting || createSchedule.isPending;

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

  async function save(values: NewScheduleValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      const schedule = await createSchedule.mutateAsync(values);
      toast.success('Schedule created');
      closeDialog();
      // The picker offers only these projects, so the new schedule's project is among them.
      const parent = projects.find((p) => p.id === schedule.projectId);
      if (parent) void navigate(filesPath(parent.workspaceId, parent.id));
    } catch (error) {
      // Only a failure re-arms the form; after a success the dialog is closing.
      submittingRef.current = false;
      // The project already uses the code (R8): the answer goes under Code.
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
      title="New schedule"
      description="Name the schedule and choose its project."
      width="md"
      isDirty={isDirty}
      isPending={isPending}
      submitLabel="Create schedule"
      pendingLabel="Creating…"
      onSubmit={onSubmit}
      onClose={closeDialog}
      onOpenAutoFocus={onOpenAutoFocus}
      footer={fallback?.footer}
    >
      {fallback ? (
        fallback.body
      ) : (
        <>
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
