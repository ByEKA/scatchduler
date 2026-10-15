import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useRef } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormDialog } from '@/components/common/FormDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCreateTeamWorkspace } from '@/hooks/useWorkspaces';
import { errorMessage } from '@/lib/format';

const NAME_RULE = 'Use 2–40 characters';

const teamWorkspaceSchema = z.object({
  name: z.string().trim().min(2, NAME_RULE).max(40, NAME_RULE),
});

type TeamWorkspaceValues = z.output<typeof teamWorkspaceSchema>;

export function NewTeamWorkspaceDialog(): ReactElement {
  const { closeDialog } = useDialogs();
  const createWorkspace = useCreateTeamWorkspace();
  const nameId = useId();
  const errorId = useId();
  // Drops a second submit that arrives before the pending state has rendered.
  const submittingRef = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({ resolver: zodResolver(teamWorkspaceSchema), defaultValues: { name: '' } });

  async function save({ name }: TeamWorkspaceValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await createWorkspace.mutateAsync({ name });
      toast.success('Workspace created');
      closeDialog();
    } catch (error) {
      // Only a failure re-arms the form; after a success the dialog is closing.
      submittingRef.current = false;
      toast.error(errorMessage(error));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(save)(event);
  }

  const nameError = errors.name?.message;

  return (
    <FormDialog
      title="New team workspace"
      description="Team workspaces hold projects you work on with others."
      width="sm"
      isDirty={isDirty}
      isPending={isSubmitting || createWorkspace.isPending}
      submitLabel="Create workspace"
      pendingLabel="Creating…"
      onSubmit={onSubmit}
      onClose={closeDialog}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} className="text-xs font-semibold">
          Workspace name
        </Label>
        <Input
          id={nameId}
          autoComplete="off"
          aria-required="true"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? errorId : undefined}
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
