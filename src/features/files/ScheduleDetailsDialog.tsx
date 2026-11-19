import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { DialogShell, FormDialog } from '@/components/common/FormDialog';
import { SectionError } from '@/components/common/SectionError';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RepositoryError } from '@/data/errors';
import type { ID, Schedule } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { suggestUpdateNumber } from '@/features/files/codes';
import {
  BASELINE_OPTIONS,
  isIsoDate,
  makeScheduleDetailsSchema,
  NOTES_MAX_LENGTH,
  scheduleDetailsValues,
  toUpdateScheduleDetailsInput,
  type ScheduleDetailsValues,
} from '@/features/files/details-schema';
import { SCHEDULE_CODE_HINT } from '@/features/schedules/schedule-schema';
import { useNow } from '@/hooks/useNow';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useUpdateScheduleDetails } from '@/hooks/useSchedules';
import { errorMessage, relativeTime, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const SKELETON_DELAY_MS = 300;
const INVALID_DATE_MESSAGE = 'Enter a valid date';

function sourceText(schedule: Schedule): string {
  if (schedule.source === 'blank') return 'Blank';
  return schedule.sourceFileName === null ? 'Imported' : `Imported from ${schedule.sourceFileName}`;
}

function LoadingShell({ onClose }: { onClose: () => void }): ReactElement | null {
  const [due, setDue] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDue(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!due) return null;
  return (
    <DialogShell title="Schedule details" width="lg" onCloseRequest={onClose}>
      <div className="flex flex-col gap-4">
        <span className="sr-only">Loading schedule…</span>
        <div
          data-testid="schedule-details-skeleton"
          aria-hidden="true"
          className="flex flex-col gap-4"
        >
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-24" />
        </div>
      </div>
    </DialogShell>
  );
}

function ScheduleDetailsForm({
  schedule,
  schedules,
}: {
  schedule: Schedule;
  schedules: readonly Schedule[];
}): ReactElement {
  const { closeDialog } = useDialogs();
  const updateDetails = useUpdateScheduleDetails();
  const now = useNow(60_000);

  const nameId = useId();
  const nameErrorId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  const statusDateId = useId();
  const statusDateErrorId = useId();
  const baselineId = useId();
  const baselineHintId = useId();
  const updateNumberId = useId();
  const updateNumberHintId = useId();
  const updateNumberErrorId = useId();
  const notesId = useId();
  const notesCounterId = useId();
  const notesErrorId = useId();

  const submittingRef = useRef(false);
  const statusDateInputRef = useRef<HTMLInputElement | null>(null);

  const otherCodes = useMemo(
    () =>
      schedules.flatMap((item) =>
        item.id !== schedule.id && item.code !== null ? [item.code] : [],
      ),
    [schedules, schedule.id],
  );
  const otherCodesRef = useRef<readonly string[]>(otherCodes);

  useLayoutEffect(() => {
    otherCodesRef.current = otherCodes;
  }, [otherCodes]);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ScheduleDetailsValues>({
    resolver: (values, context, options) =>
      zodResolver(makeScheduleDetailsSchema(otherCodesRef.current))(values, context, options),
    defaultValues: scheduleDetailsValues(schedule, otherCodes),
  });

  const watchedStatusDate = useWatch({ control, name: 'statusDate' });
  const watchedBaseline = useWatch({ control, name: 'baseline' });
  const watchedUpdateNumber = useWatch({ control, name: 'updateNumber' });
  const watchedNotes = useWatch({ control, name: 'notes' });

  const isPending = isSubmitting || updateDetails.isPending;

  const otherPrimary = useMemo(
    () => schedules.find((item) => item.id !== schedule.id && item.baseline === 'primary'),
    [schedules, schedule.id],
  );
  let baselineHint: string | null = null;
  if (watchedBaseline === 'primary' && otherPrimary !== undefined) {
    baselineHint = `Comparisons against the primary baseline will use this schedule instead of ${otherPrimary.name}.`;
  } else if (schedule.baseline === 'primary' && watchedBaseline !== 'primary') {
    baselineHint = 'The project will have no primary baseline until you choose one.';
  }

  const validStatusDate = isIsoDate(watchedStatusDate) ? watchedStatusDate : null;
  const suggestedUpdate = suggestUpdateNumber(schedules, schedule.id, validStatusDate);

  async function save(values: ScheduleDetailsValues): Promise<void> {
    if (statusDateInputRef.current?.validity.badInput) {
      setError(
        'statusDate',
        { type: 'badInput', message: INVALID_DATE_MESSAGE },
        { shouldFocus: true },
      );
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await updateDetails.mutateAsync(toUpdateScheduleDetailsInput(values, schedule.id));
      toast.success('Details saved');
      closeDialog();
    } catch (error) {
      submittingRef.current = false;
      if (error instanceof RepositoryError && error.code === 'conflict') {
        const field = error.message.toLowerCase().includes('update number')
          ? 'updateNumber'
          : 'code';
        setError(field, { type: 'conflict', message: error.message }, { shouldFocus: true });
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(save, () => {
      if (statusDateInputRef.current?.validity.badInput) {
        setError('statusDate', { type: 'badInput', message: INVALID_DATE_MESSAGE });
      }
    })(event);
  }

  const nameError = errors.name?.message;
  const codeError = errors.code?.message;
  const statusDateError = errors.statusDate?.message;
  const updateNumberError = errors.updateNumber?.message;
  const notesError = errors.notes?.message;
  const statusDateField = register('statusDate');

  return (
    <FormDialog
      title="Schedule details"
      width="lg"
      isDirty={isDirty}
      isPending={isPending}
      submitLabel="Save"
      pendingLabel="Saving…"
      onSubmit={onSubmit}
      onClose={closeDialog}
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
        <Label htmlFor={statusDateId} className="text-xs font-semibold">
          Status date
        </Label>
        <Input
          id={statusDateId}
          type="date"
          autoComplete="off"
          aria-invalid={statusDateError ? true : undefined}
          aria-describedby={statusDateError ? statusDateErrorId : undefined}
          readOnly={isPending}
          className="dark:scheme-dark"
          {...statusDateField}
          ref={(node) => {
            statusDateField.ref(node);
            statusDateInputRef.current = node;
          }}
        />
        {statusDateError && (
          <p id={statusDateErrorId} className="text-xs text-destructive">
            {statusDateError}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend id={baselineId} className="text-xs font-semibold">
          Baseline
        </legend>
        <Controller
          control={control}
          name="baseline"
          render={({ field }) => (
            <RadioGroup
              aria-labelledby={baselineId}
              aria-describedby={baselineHint ? baselineHintId : undefined}
              value={field.value}
              onValueChange={field.onChange}
              disabled={isPending}
              className="gap-2"
            >
              {BASELINE_OPTIONS.map((option) => {
                const optionId = `${baselineId}-${option.value}`;
                return (
                  <div key={option.value} className="flex items-center gap-2">
                    <RadioGroupItem
                      id={optionId}
                      value={option.value}
                      className="focus-visible:ring-ring"
                    />
                    <Label htmlFor={optionId} className="text-sm font-normal">
                      {option.label}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        />
        {baselineHint !== null && (
          <p id={baselineHintId} className="text-xs text-muted-foreground">
            {baselineHint}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={updateNumberId} className="text-xs font-semibold">
          Update number
        </Label>
        <Input
          id={updateNumberId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={updateNumberError ? true : undefined}
          aria-describedby={
            updateNumberError ? `${updateNumberHintId} ${updateNumberErrorId}` : updateNumberHintId
          }
          readOnly={isPending}
          {...register('updateNumber')}
        />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p id={updateNumberHintId} className="text-xs text-muted-foreground">
            Leave empty if this isn&apos;t a status update.
          </p>
          {watchedUpdateNumber.trim() === '' && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setValue('updateNumber', String(suggestedUpdate), { shouldDirty: true });
                clearErrors('updateNumber');
              }}
              className="text-xs font-medium text-link hover:underline focus-visible:rounded-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              {`Use ${suggestedUpdate}`}
            </button>
          )}
        </div>
        {updateNumberError && (
          <p id={updateNumberErrorId} className="text-xs text-destructive">
            {updateNumberError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={notesId} className="text-xs font-semibold">
          Notes
        </Label>
        <Textarea
          id={notesId}
          rows={4}
          aria-invalid={notesError ? true : undefined}
          aria-describedby={notesError ? `${notesCounterId} ${notesErrorId}` : notesCounterId}
          readOnly={isPending}
          className="field-sizing-fixed"
          {...register('notes')}
        />
        <div className="flex items-start justify-between gap-3">
          {notesError ? (
            <p id={notesErrorId} className="text-xs text-destructive">
              {notesError}
            </p>
          ) : (
            <span />
          )}
          <span
            id={notesCounterId}
            className={cn(
              'shrink-0 text-xs text-muted-foreground tabular-nums',
              watchedNotes.length > NOTES_MAX_LENGTH && 'text-destructive',
            )}
          >
            {`${watchedNotes.length}/${NOTES_MAX_LENGTH}`}
          </span>
        </div>
      </div>

      <dl className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <dt className="font-medium text-foreground">Source</dt>
          <dd className="min-w-0 break-words">{sourceText(schedule)}</dd>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span>{`Created ${shortDate(schedule.createdAt)}`}</span>
          <span>{`Last modified ${relativeTime(schedule.updatedAt, now)}`}</span>
        </div>
      </dl>
    </FormDialog>
  );
}

/**
 * "Schedule details" (P3 core spec §6.4, D39): reads the schedule from `useProjectSchedules` and
 * edits its name, code, status date, baseline, update number and notes.
 */
export function ScheduleDetailsDialog({
  projectId,
  scheduleId,
}: {
  projectId: ID;
  scheduleId: ID;
}): ReactElement {
  const { closeDialog } = useDialogs();
  const schedules = useProjectSchedules(projectId);
  const schedule = schedules.data?.find((item) => item.id === scheduleId);

  if (schedules.data !== undefined && schedule !== undefined) {
    return <ScheduleDetailsForm key={schedule.id} schedule={schedule} schedules={schedules.data} />;
  }

  const missing = schedules.isSuccess && schedule === undefined;
  if (!schedules.isError && !missing) {
    return <LoadingShell onClose={closeDialog} />;
  }

  return (
    <DialogShell title="Schedule details" width="lg" onCloseRequest={closeDialog}>
      <SectionError
        error={schedules.error}
        onRetry={() => void schedules.refetch()}
        className="py-6"
      />
    </DialogShell>
  );
}
