import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { FormDialog, FormDialogPresence } from '@/components/common/FormDialog';
import { AuthField } from '@/features/auth/AuthCard';
import { personNameSchema } from '@/features/auth/password-schema';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUpdateProfile } from '@/hooks/useProfile';
import { errorMessage } from '@/lib/format';

type NameValues = z.output<typeof personNameSchema>;

/**
 * Asks for a missing name (P2 spec §5.6). `AppShell` renders it directly, not through
 * `DialogsProvider`. It is open while the current user's first name is empty and it hasn't been
 * dismissed; Cancel keeps it closed until the next page load.
 */
export function CompleteProfileDialog(): ReactElement | null {
  const { data: user } = useCurrentUser();
  const [dismissed, setDismissed] = useState(false);
  const updateProfile = useUpdateProfile();
  // Drops a second submit that arrives before the pending state has rendered.
  const submittingRef = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(personNameSchema),
    defaultValues: { firstName: '', lastName: '' },
  });

  if (user === undefined) return null;
  const open = user.firstName === '' && !dismissed;

  async function save(values: NameValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      // The refetched user has a first name, which closes the dialog.
      await updateProfile.mutateAsync(values);
      toast.success('Name saved');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      submittingRef.current = false;
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    void handleSubmit(save)(event);
  }

  return (
    // Radix focuses the first field on open; closing leaves focus where it is (no opener).
    <FormDialogPresence open={open} opener={null} onExitComplete={() => {}}>
      <FormDialog
        title="Add your name"
        description="Your name is shown to people in your workspaces."
        width="sm"
        isDirty={isDirty}
        isPending={isSubmitting || updateProfile.isPending}
        submitLabel="Save"
        pendingLabel="Saving…"
        onSubmit={onSubmit}
        onClose={() => setDismissed(true)}
      >
        <AuthField
          label="First name"
          autoComplete="given-name"
          error={errors.firstName?.message}
          registration={register('firstName')}
        />
        <AuthField
          label="Last name"
          autoComplete="family-name"
          error={errors.lastName?.message}
          registration={register('lastName')}
        />
      </FormDialog>
    </FormDialogPresence>
  );
}
