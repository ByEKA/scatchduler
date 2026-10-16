import { Check, ImageUp, Loader2 } from 'lucide-react';
import { useId } from 'react';
import type { ReactElement } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { FileDropzone } from '@/components/common/FileDropzone';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';

/**
 * Where the Project ID availability check stands for the ID in the field: `idle` while the ID is
 * malformed (the check doesn't run), `checking` until the answer for this exact ID is in.
 */
export type CodeCheck = 'idle' | 'checking' | 'available' | 'taken' | 'failed';

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

/** Step 1: name, Project ID with its availability check, photo and description (spec §6.7). */
export function DetailsStep({ codeCheck }: { codeCheck: CodeCheck }): ReactElement {
  const { control } = useFormContext<ProjectFormValues>();
  const { locked, onFieldChange } = useWizardFields();
  return (
    <>
      <FieldRow>
        <TextField name="name" label="Project name" required />
        <ProjectIdField codeCheck={codeCheck} />
      </FieldRow>
      <Controller
        control={control}
        name="coverImage"
        render={({ field, fieldState }) => (
          <FileDropzone
            ref={field.ref}
            label="Project photo"
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
      <DescriptionField />
    </>
  );
}
