import { zodResolver } from '@hookform/resolvers/zod';
import type { UseQueryResult } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, MouseEvent, ReactElement } from 'react';
import { FormProvider, useForm, useWatch, type FieldErrors, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import { FormDialog } from '@/components/common/FormDialog';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { RepositoryError } from '@/data/errors';
import type { ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import {
  CODE_TAKEN_MESSAGE,
  EMPTY_PROJECT_FORM,
  INVALID_DATE_MESSAGE,
  projectFormSchema,
  projectFormValues,
  STEP_FIELDS,
  toNewProjectInput,
  toUpdateProjectInput,
  WIZARD_STEPS,
  type ProjectFormValues,
} from '@/features/projects/project-schema';
import { AttributesStep } from '@/features/projects/steps/AttributesStep';
import { ClientStep } from '@/features/projects/steps/ClientStep';
import { DetailsStep, type CodeCheck } from '@/features/projects/steps/DetailsStep';
import { LocationStep } from '@/features/projects/steps/LocationStep';
import { WizardFieldsProvider } from '@/features/projects/steps/StepFields';
import { WizardStepper } from '@/features/projects/WizardStepper';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useCreateProject, useProjectCodeAvailable, useUpdateProject } from '@/hooks/useProjects';
import { errorMessage } from '@/lib/format';

type FieldName = keyof ProjectFormValues;

/**
 * What the wizard does: create a project in the current workspace, or edit `project` (P3 core spec
 * D20). Read only (viewers), the edit mode shows the project's details and changes nothing.
 */
export type WizardMode =
  | { kind: 'create' }
  | { kind: 'edit'; project: ProjectSummary; workspace: WorkspaceSummary; readOnly: boolean };

const CREATE_MODE: WizardMode = { kind: 'create' };

const LAST_STEP = WIZARD_STEPS.length - 1;
// The format useProjectCodeAvailable checks before it asks the repository (spec §5.5).
const CODE_FORMAT = /^[A-Za-z0-9_-]{1,16}$/;
const CODE_CHECK_DELAY_MS = 300;
const DATE_FIELDS = [
  'statusDate',
  'startDate',
  'plannedFinishDate',
] as const satisfies readonly FieldName[];

// Read only, these are disabled (the selects and the photo's drop area), so they can't take focus.
const DISABLED_WHEN_READ_ONLY: ReadonlySet<FieldName> = new Set<FieldName>([
  'status',
  'stage',
  'projectType',
  'sector',
  'coverImage',
]);

const schemaResolver = zodResolver(projectFormSchema);

/**
 * The schema's answer, plus "Enter a valid date" for a date input on screen that holds a partial
 * entry such as 10/dd/2026. The browser reports that value as '' with `validity.badInput` set and
 * fires no change event, so the schema alone would read it as no date and save null.
 */
const projectFormResolver: Resolver<ProjectFormValues> = async (values, context, options) => {
  const result = await schemaResolver(values, context, options);
  const errors: FieldErrors<ProjectFormValues> = { ...result.errors };
  let added = false;
  for (const name of DATE_FIELDS) {
    const input = options.fields[name]?.ref;
    if (
      errors[name] === undefined &&
      input instanceof HTMLInputElement &&
      input.isConnected &&
      input.validity.badInput
    ) {
      errors[name] = { type: 'badInput', message: INVALID_DATE_MESSAGE, ref: input };
      added = true;
    }
  }
  return added ? { values: {}, errors } : result;
};

/** A click after the first of a quick series, such as a double click's second; keys report 0. */
function isRepeatClick(event: MouseEvent<HTMLButtonElement>): boolean {
  return event.detail > 1;
}

/**
 * "Next" and "Create project" share the footer slot, so the second click of a double click on
 * "Next" would land on the next step's button: on step 3 it would create the project unseen.
 * Repeated clicks are dropped.
 */
function dropRepeatClick(event: MouseEvent<HTMLButtonElement>): void {
  if (isRepeatClick(event)) event.preventDefault();
}

/**
 * Enter in a field acts as "Next", and the next step focuses its first field, so a held Enter
 * would walk on through the steps and submit from step 4's Address. A key's repeated keydowns
 * carry `repeat`; they are dropped before the focused control sees them. A held Enter in the
 * Description still adds lines.
 */
function dropRepeatEnter(event: KeyboardEvent<HTMLFormElement>): void {
  if (event.key === 'Enter' && event.repeat && !(event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault();
  }
}

function stepAt(index: number): (typeof WIZARD_STEPS)[number] {
  return WIZARD_STEPS[index] ?? WIZARD_STEPS[0];
}

function firstField(index: number): FieldName {
  return STEP_FIELDS[stepAt(index).id][0] ?? 'name';
}

function stepIndexOf(name: FieldName): number {
  return WIZARD_STEPS.findIndex((step) => STEP_FIELDS[step.id].includes(name));
}

function sameCode(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The availability of the ID in the field. While the debounced ID lags the typed one, or the
 * answer is on its way, it reads `checking`, so the previous ID's answer never shows for new text.
 * The edited project's own ID (`ownCode`) isn't checked (P3 core spec §6.4).
 */
function codeCheckFor(
  code: string,
  checkedCode: string,
  ownCode: string | null,
  query: UseQueryResult<boolean>,
): CodeCheck {
  if (!CODE_FORMAT.test(code.trim())) return 'idle';
  if (ownCode !== null && sameCode(code, ownCode)) return 'idle';
  if (!sameCode(code, checkedCode) || query.isFetching) return 'checking';
  if (query.isError) return 'failed';
  if (query.data === false) return 'taken';
  if (query.data === true) return 'available';
  return 'checking';
}

/**
 * Creates a project in the current workspace in four steps (spec §6.7). "Next" checks the step on
 * screen; the Project ID is checked for availability as it is typed, and the create request's
 * conflict answer returns to step 1. On success the new project becomes the current one and the
 * page stays as it is.
 *
 * In edit mode (P3 core spec §6.4, D20) the same steps hold the project's values and start
 * completed; "Save changes" on every step checks them all and opens the step of the first invalid
 * field. Read only, the fields can't change and the footer only closes the dialog.
 */
export function NewProjectWizard({ mode = CREATE_MODE }: { mode?: WizardMode }): ReactElement {
  const { closeDialog } = useDialogs();
  const { status, error: contextError, workspace, setProject, retry } = useCurrentContext();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const edited = mode.kind === 'edit' ? mode.project : null;
  const readOnly = mode.kind === 'edit' && mode.readOnly;
  // The form keeps the values it opened with; a refetched project doesn't replace the user's edits.
  const [defaultValues] = useState(() =>
    edited === null ? EMPTY_PROJECT_FORM : projectFormValues(edited),
  );
  const form = useForm<ProjectFormValues>({
    resolver: projectFormResolver,
    defaultValues,
    // The wizard focuses the first invalid field itself, on the step that shows it.
    shouldFocusError: false,
  });
  const {
    control,
    handleSubmit,
    trigger,
    setFocus,
    setError,
    getFieldState,
    formState: { isDirty, isSubmitting },
  } = form;
  const [step, setStep] = useState(0);
  // Steps before this index have passed "Next". An edited project's steps start completed.
  const [completed, setCompleted] = useState(edited === null ? 0 : WIZARD_STEPS.length);
  // The last step whose "Next" was pressed. Its fields and earlier ones check themselves as they
  // change, so an error goes away once fixed. An edited project's fields all do.
  const [checkedThrough, setCheckedThrough] = useState(edited === null ? -1 : LAST_STEP);
  // Drops a second submit that arrives before the pending state has rendered.
  const submittingRef = useRef(false);
  // Counts step changes, so a "Next" whose validation finishes after another move is dropped.
  const navigationRef = useRef(0);
  // The field to focus once the step that holds it has rendered.
  const focusAfterRenderRef = useRef<{ step: number; name: FieldName } | null>(null);

  // The workspace the dialog checks the ID against and creates the project in. After a change of
  // workspace (Back or Forward while the dialog is open) both follow the new one. The fields need
  // no data, so they show while it loads; only a workspace list that failed to load replaces them.
  // An edited project stays in its own workspace.
  const workspaceId = edited === null ? workspace?.id : edited.workspaceId;
  const view = workspaceId === undefined && status === 'error' ? 'error' : 'form';
  const isPending = isSubmitting || createProject.isPending || updateProject.isPending;

  const ownCode = edited === null ? null : edited.code;
  const code = useWatch({ control, name: 'code' });
  const checkedCode = useDebouncedValue(code, CODE_CHECK_DELAY_MS);
  // The project's own ID, in any case and with outer spaces, isn't asked about.
  const availability = useProjectCodeAvailable(
    workspaceId,
    ownCode !== null && sameCode(checkedCode, ownCode) ? '' : checkedCode,
  );
  const codeCheck = codeCheckFor(code, checkedCode, ownCode, availability);

  /**
   * The step's first field that can take focus. A disabled field ignores focus, and the stepper
   * button that was used goes away with the step change, so focus would fall to the dialog: read
   * only, the selects are skipped, and the status date that follows the current schedule (R6).
   */
  function firstFocusableField(index: number): FieldName {
    const followsSchedule = edited !== null && edited.currentSchedule !== null;
    const canFocus = (name: FieldName): boolean =>
      !(readOnly && DISABLED_WHEN_READ_ONLY.has(name)) &&
      !(followsSchedule && name === 'statusDate');
    return STEP_FIELDS[stepAt(index).id].find(canFocus) ?? firstField(index);
  }

  useEffect(() => {
    const pending = focusAfterRenderRef.current;
    // A click can run between an earlier render's commit and its effects. That effect still sees
    // the old step, where the field's ref is a detached element, so it waits for the new step.
    if (pending === null || pending.step !== step) return;
    focusAfterRenderRef.current = null;
    setFocus(pending.name);
  });

  // When the form replaces the error after Retry, its step's first field takes focus. On open the
  // content isn't attached yet when this runs; onOpenAutoFocus covers the open.
  const onViewChange = useEffectEvent(() => {
    if (view === 'form') setFocus(firstFocusableField(step));
  });
  useEffect(() => {
    onViewChange();
  }, [view]);

  function onOpenAutoFocus(event: Event): void {
    if (view !== 'form') return;
    event.preventDefault();
    setFocus(firstFocusableField(step));
  }

  /** Shows step `index` and focuses `focus`, by default the step's first field that can take it. */
  function goTo(index: number, focus: FieldName = firstFocusableField(index)): void {
    navigationRef.current += 1;
    if (index === step) {
      setFocus(focus);
      return;
    }
    focusAfterRenderRef.current = { step: index, name: focus };
    setStep(index);
  }

  /** Validates the step on screen and moves on to step `target` when it passes. */
  async function goForward(target: number): Promise<void> {
    const from = step;
    const move = ++navigationRef.current;
    setCheckedThrough((through) => Math.max(through, from));
    const fields = STEP_FIELDS[stepAt(from).id];
    const valid = await trigger(fields);
    if (move !== navigationRef.current) return;
    if (!valid) {
      const invalid = fields.find((name) => getFieldState(name).invalid);
      if (invalid) setFocus(invalid);
      return;
    }
    if (from === 0 && codeCheck === 'taken') {
      setFocus('code');
      return;
    }
    setCompleted((done) => Math.max(done, target));
    goTo(target);
  }

  function selectStep(index: number): void {
    // Read only, nothing changes, so there is nothing to check on the way.
    if (index < step || readOnly) goTo(index);
    else if (index > step) void goForward(index);
  }

  /** A field changed: once its step has been checked, it is checked again. */
  function recheck(name: FieldName): void {
    if (stepIndexOf(name) > checkedThrough) return;
    // The finish date's error depends on the start date.
    void trigger(name === 'startDate' ? ['startDate', 'plannedFinishDate'] : name);
  }

  /** Opens the step of the first invalid field; a known-taken ID counts as one on step 1 (D12). */
  function focusFirstError(errors: FieldErrors<ProjectFormValues>): void {
    for (const [index, wizardStep] of WIZARD_STEPS.entries()) {
      const invalid = STEP_FIELDS[wizardStep.id].find(
        (name) => errors[name] !== undefined || (name === 'code' && codeCheck === 'taken'),
      );
      if (invalid) {
        goTo(index, invalid);
        return;
      }
    }
  }

  async function save(values: ProjectFormValues): Promise<void> {
    if (submittingRef.current || workspaceId === undefined || readOnly) return;
    // The ID was found taken after step 1 was left: back there, where the error shows.
    if (codeCheck === 'taken') {
      goTo(0, 'code');
      return;
    }
    submittingRef.current = true;
    try {
      if (edited === null) {
        const project = await createProject.mutateAsync(toNewProjectInput(values, workspaceId));
        toast.success('Project created');
        closeDialog();
        setProject(project.id);
      } else {
        // With a current schedule the status date follows it, so the request leaves it out (R6).
        const input = toUpdateProjectInput(values, edited.id, {
          includeStatusDate: edited.currentSchedule === null,
        });
        await updateProject.mutateAsync({ workspaceId: edited.workspaceId, input });
        toast.success('Project updated');
        closeDialog();
      }
    } catch (error) {
      // Only a failure re-arms the form; after a success the dialog is closing.
      submittingRef.current = false;
      if (error instanceof RepositoryError && error.code === 'conflict') {
        setError('code', { type: 'conflict', message: CODE_TAKEN_MESSAGE });
        goTo(0, 'code');
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    if (readOnly) {
      event.preventDefault();
      return;
    }
    // Editing, "Save changes" (or Enter in a field) saves from any step.
    if (edited !== null) {
      void handleSubmit(save, focusFirstError)(event);
      return;
    }
    if (view !== 'form' || step < LAST_STEP) {
      // Enter in a field, or "Next": the form submits only from the last step.
      event.preventDefault();
      if (view === 'form') void goForward(step + 1);
      return;
    }
    void handleSubmit(save, focusFirstError)(event);
  }

  const body =
    view === 'form' ? (
      <WizardFieldsProvider value={{ locked: isPending || readOnly, onFieldChange: recheck }}>
        {/* Keyed by step, so each step fades in (spec §6.11). */}
        <div key={step} className="flex animate-in flex-col gap-4 duration-120 ease-out fade-in-0">
          {step === 0 && (
            <DetailsStep
              codeCheck={codeCheck}
              currentCoverUrl={edited?.coverImageUrl ?? null}
              readOnly={readOnly}
            />
          )}
          {step === 1 && (
            <AttributesStep currentScheduleName={edited?.currentSchedule?.name ?? null} />
          )}
          {step === 2 && <ClientStep />}
          {step === 3 && <LocationStep />}
        </div>
      </WizardFieldsProvider>
    ) : (
      <SectionError error={contextError} onRetry={retry} className="py-6" />
    );

  let title = 'New project';
  if (mode.kind === 'edit') title = mode.readOnly ? 'Project details' : 'Edit project';

  function createFooter(requestClose: () => void): ReactElement {
    return (
      <>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={requestClose}
          className="mr-auto"
        >
          Cancel
        </Button>
        {view === 'form' && step > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => goTo(step - 1)}
          >
            Back
          </Button>
        )}
        {view === 'form' && step < LAST_STEP && (
          <Button
            key="next"
            type="submit"
            disabled={step === 0 && codeCheck === 'taken'}
            onClick={dropRepeatClick}
          >
            Next
          </Button>
        )}
        {/* Until the workspace has loaded there is nowhere to create the project. */}
        {view === 'form' && step === LAST_STEP && (
          <Button
            key="create"
            type="submit"
            disabled={isPending || workspaceId === undefined}
            onClick={dropRepeatClick}
          >
            {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isPending ? 'Creating…' : 'Create project'}
          </Button>
        )}
      </>
    );
  }

  /**
   * "Save changes" is the form's submit button, so Enter in a field saves; "Next" and "Back" only
   * move. On the last step "Back" takes the place "Next" had, so the second click of a double
   * click on "Next" there is dropped instead of going back. As "Next" in create mode, "Save
   * changes" is disabled on step 1 while the ID is known to be taken; on a later step it stays
   * enabled and returns to step 1 (P1 spec D12).
   */
  function editFooter(requestClose: () => void): ReactElement {
    return (
      <>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={requestClose}
          className="mr-auto"
        >
          Cancel
        </Button>
        {step > 0 && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={(event) => {
              if (!isRepeatClick(event)) goTo(step - 1);
            }}
          >
            Back
          </Button>
        )}
        {step < LAST_STEP && (
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || (step === 0 && codeCheck === 'taken')}
            onClick={(event) => {
              if (!isRepeatClick(event)) void goForward(step + 1);
            }}
          >
            Next
          </Button>
        )}
        <Button type="submit" disabled={isPending || (step === 0 && codeCheck === 'taken')}>
          {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </>
    );
  }

  function footer({ requestClose }: { requestClose: () => void }): ReactElement {
    if (readOnly) {
      return (
        <Button type="button" variant="secondary" onClick={requestClose}>
          Close
        </Button>
      );
    }
    return edited === null ? createFooter(requestClose) : editFooter(requestClose);
  }

  return (
    <FormProvider {...form}>
      <FormDialog
        title={title}
        description={mode.kind === 'edit' ? `In ${mode.workspace.name}` : undefined}
        header={
          <div className="mt-3">
            <WizardStepper
              current={step}
              completed={completed}
              onSelect={selectStep}
              disabled={isPending || view !== 'form'}
            />
          </div>
        }
        width="xl"
        isDirty={isDirty}
        isPending={isPending}
        submitLabel={edited === null ? 'Create project' : 'Save changes'}
        pendingLabel={edited === null ? 'Creating…' : 'Saving…'}
        onSubmit={onSubmit}
        onClose={closeDialog}
        onOpenAutoFocus={onOpenAutoFocus}
        onKeyDownCapture={dropRepeatEnter}
        footer={footer}
      >
        {body}
      </FormDialog>
    </FormProvider>
  );
}
