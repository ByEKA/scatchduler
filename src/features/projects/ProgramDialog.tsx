import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useRef } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RepositoryError } from '@/data/errors';
import type { ID, Program } from '@/data/types';
import { useCreateProgram, useRenameProgram } from '@/hooks/usePrograms';
import { errorMessage } from '@/lib/format';

const programSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a program name.')
    .max(80, 'Use 80 characters or fewer.'),
});

type ProgramFormValues = z.output<typeof programSchema>;

export type ProgramDialogTarget =
  | {
      mode: 'create';
      workspaceId: ID;
    }
  | {
      mode: 'rename';
      program: Program;
    };

export function ProgramDialog({
  target,
  onClose,
}: {
  target: ProgramDialogTarget;
  onClose(): void;
}): ReactElement {
  const createProgram = useCreateProgram();
  const renameProgram = useRenameProgram();
  const nameId = useId();
  const errorId = useId();
  const submittingRef = useRef(false);

  const initialName = target.mode === 'rename' ? target.program.name : '';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(programSchema),
    defaultValues: { name: initialName },
  });

  const isPending = isSubmitting || createProgram.isPending || renameProgram.isPending;

  async function save({ name }: ProgramFormValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (target.mode === 'create') {
        await createProgram.mutateAsync({ workspaceId: target.workspaceId, name });
        toast.success('Program created');
      } else {
        await renameProgram.mutateAsync({ programId: target.program.id, name });
        toast.success('Program renamed');
      }
      onClose();
    } catch (error) {
      submittingRef.current = false;
      if (
        error instanceof RepositoryError &&
        (error.code === 'conflict' || error.code === 'validation')
      ) {
        setError('name', { type: error.code, message: error.message }, { shouldFocus: true });
      } else {
        toast.error(errorMessage(error));
      }
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(save)(event);
  }

  const nameError = errors.name?.message;

  return (
    <FormDialog
      title={target.mode === 'rename' ? 'Rename program' : 'New program'}
      description={
        target.mode === 'rename'
          ? 'Choose a new name for this program.'
          : 'Group related projects in this workspace under one program.'
      }
      width="sm"
      isDirty={isDirty}
      isPending={isPending}
      submitLabel={target.mode === 'rename' ? 'Save' : 'Create program'}
      pendingLabel={target.mode === 'rename' ? 'Saving…' : 'Creating…'}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} className="text-xs font-semibold">
          Program name
        </Label>
        <Input
          id={nameId}
          autoComplete="off"
          aria-required="true"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? errorId : undefined}
          readOnly={isPending}
          {...register('name')}
        />
        {nameError && (
          <p id={errorId} className="text-xs text-destructive">
            {nameError}
          </p>
        )}
      </div>
    </FormDialog>
  );
}
