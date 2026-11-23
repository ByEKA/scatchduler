import { Check, ImageUp, Loader2 } from 'lucide-react';
import { useId } from 'react';
import type { ReactElement } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { FileDropzone } from '@/components/common/FileDropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ID } from '@/data/types';
import {
  CODE_TAKEN_MESSAGE,
  COVER_IMAGE_TYPES,
  DESCRIPTION_MAX_LENGTH,
  MAX_COVER_IMAGE_BYTES,
  type ProjectFormValues,
} from '@/features/projects/project-schema';
import {
  FieldError,
  FieldLabel,
  FieldRow,
  TextField,
  useWizardFields,
} from '@/features/projects/steps/StepFields';
import { useWorkspacePrograms } from '@/hooks/usePrograms';
import { cn } from '@/lib/utils';

/**
 * Where the Project ID availability check stands for the ID in the field: `idle` while the ID is
 * malformed (the check doesn't run), `checking` until the answer for this exact ID is in.
 */
export type CodeCheck = 'idle' | 'checking' | 'available' | 'taken' | 'failed';

const PHOTO_LABEL = 'Project photo';
const PHOTO_HINT = 'JPG or PNG · up to 5 MB';

function ProjectIdField({ codeCheck }: { codeCheck: CodeCheck }): ReactElement {
  const {
    register,
    formState: { errors },
  } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const id = useId();
  const errorId = useId();
  const hintId = useId();
  // A schema error, or the conflict a submit found. Both show after Next or Create project, which
  // moves focus to the field, so its description reads them out.
  const fieldError = errors.code?.message;
  // The check's answers, which arrive while the user types.
  const taken = fieldError === undefined && codeCheck === 'taken';
  const error = taken ? CODE_TAKEN_MESSAGE : fieldError;
  // The submit's conflict check decides in the end, so a failed check only adds a hint.
  const hint = error === undefined && codeCheck === 'failed';
  let describedBy: string | undefined;
  if (error !== undefined) describedBy = errorId;
  else if (hint) describedBy = hintId;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <FieldLabel htmlFor={id} required>
        Project ID
      </FieldLabel>
      <div className="relative">
        <Input
          id={id}
          autoComplete="off"
          spellCheck={false}
          aria-required="true"
          aria-invalid={error !== undefined ? true : undefined}
          aria-describedby={describedBy}
          readOnly={locked}
          className="pr-9 font-mono"
          {...register('code', { onChange: () => onFieldChange('code') })}
        />
        {codeCheck === 'checking' && (
          <Loader2
            aria-hidden="true"
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
        {/* Not beside an error: the submit's conflict outranks the check that found it free. */}
        {codeCheck === 'available' && error === undefined && (
          <Check
            aria-hidden="true"
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-success"
          />
        )}
      </div>
      {fieldError !== undefined && <FieldError id={errorId}>{fieldError}</FieldError>}
      {/* The check answers while the user types, away from focus, so its outcome goes into a
          status region that is always there (WCAG 4.1.3). Empty, it takes no room. */}
      <div role="status" className="empty:-mt-1.5">
        {taken && <FieldError id={errorId}>{CODE_TAKEN_MESSAGE}</FieldError>}
        {hint && (
          <p id={hintId} className="text-xs text-muted-foreground">
            Couldn&apos;t check this ID right now
          </p>
        )}
      </div>
    </div>
  );
}

function ProgramField({ workspaceId }: { workspaceId: ID | undefined }): ReactElement | null {
  const { register } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const programsQuery = useWorkspacePrograms(workspaceId);
  const id = useId();
  const programs = programsQuery.data ?? [];
  if (programs.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>Program (optional)</FieldLabel>
      <select
        id={id}
        disabled={locked}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
        {...register('programId', { onChange: () => onFieldChange('programId') })}
      >
        <option value="">None</option>
        {programs.map((program) => (
          <option key={program.id} value={program.id}>
            {program.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DescriptionField(): ReactElement {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const id = useId();
  const counterId = useId();
  const errorId = useId();
  const length = useWatch({ control, name: 'description' }).length;
  const error = errors.description?.message;
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>Description (optional)</FieldLabel>
      <Textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${counterId} ${errorId}` : counterId}
        readOnly={locked}
        className="field-sizing-fixed"
        {...register('description', { onChange: () => onFieldChange('description') })}
      />
      <div className="flex items-start justify-between gap-3">
        {error ? <FieldError id={errorId}>{error}</FieldError> : <span />}
        <span
          id={counterId}
          className={cn(
            'shrink-0 text-xs text-muted-foreground tabular-nums',
            length > DESCRIPTION_MAX_LENGTH && 'text-destructive',
          )}
        >
          {`${length}/${DESCRIPTION_MAX_LENGTH}`}
        </span>
      </div>
    </div>
  );
}

/**
 * The edited project's photo while it stays (P3 core spec §6.4 "Photo in edit"): a thumbnail with
 * "Remove", which clears `keepCover`. Read only, it has no "Remove". The image is named by the
 * field's label, so assistive tech learns the project has a photo, and it describes "Remove".
 */
function CurrentPhoto({ url, readOnly }: { url: string; readOnly: boolean }): ReactElement {
  const { setValue, setFocus } = useFormContext<ProjectFormValues>();
  const { locked } = useWizardFields();
  const imageId = useId();

  function remove(): void {
    // "Remove" goes with the photo, so focus moves to the drop area instead of the page.
    setFocus('coverImage');
    setValue('keepCover', false, { shouldDirty: true });
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted p-1">
      <img
        id={imageId}
        src={url}
        alt={PHOTO_LABEL}
        className="h-16 w-24 shrink-0 rounded-sm bg-background object-cover"
      />
      {!readOnly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-describedby={imageId}
          disabled={locked}
          onClick={remove}
        >
          Remove
        </Button>
      )}
    </div>
  );
}

/**
 * Step 1: name, Project ID with its availability check, optional program, photo and description
 * (spec §6.7, P4 later §7.3.1). An edited project's photo (`currentCoverUrl`) shows under the drop
 * area until "Remove" or a chosen file replaces it.
 */
export function DetailsStep({
  codeCheck,
  workspaceId,
  currentCoverUrl = null,
  readOnly = false,
}: {
  codeCheck: CodeCheck;
  workspaceId?: ID;
  currentCoverUrl?: string | null;
  readOnly?: boolean;
}): ReactElement {
  const { control } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  const keepCover = useWatch({ control, name: 'keepCover' });
  const coverImage = useWatch({ control, name: 'coverImage' });
  const showCurrentPhoto = currentCoverUrl !== null && keepCover && coverImage === null;
  return (
    <>
      <FieldRow>
        <TextField name="name" label="Project name" required />
        <ProjectIdField codeCheck={codeCheck} />
      </FieldRow>
      <ProgramField workspaceId={workspaceId} />
      <Controller
        control={control}
        name="coverImage"
        render={({ field, fieldState }) => (
          <FileDropzone
            ref={field.ref}
            label={PHOTO_LABEL}
            accept={[...COVER_IMAGE_TYPES]}
            maxBytes={MAX_COVER_IMAGE_BYTES}
            hint={PHOTO_HINT}
            height={120}
            icon={ImageUp}
            thumbnail
            value={field.value}
            onChange={(file) => {
              field.onChange(file);
              onFieldChange('coverImage');
            }}
            error={fieldState.error?.message}
            disabled={locked}
          />
        )}
      />
      {showCurrentPhoto && <CurrentPhoto url={currentCoverUrl} readOnly={readOnly} />}
      <DescriptionField />
    </>
  );
}
