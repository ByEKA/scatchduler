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
import type { Folder, ID } from '@/data/types';
import { useCreateFolder, useRenameFolder } from '@/hooks/useFolders';
import { errorMessage } from '@/lib/format';

const folderSchema = z.object({
  name: z.string().trim().min(1, 'Enter a folder name.').max(80, 'Use 80 characters or fewer.'),
});

type FolderFormValues = z.output<typeof folderSchema>;

export type FolderDialogTarget =
  | {
      mode: 'create';
      projectId: ID;
      parentId: ID | null;
      parentName?: string;
    }
  | {
      mode: 'rename';
      folder: Folder;
    };

export function FolderDialog({
  target,
  onClose,
}: {
  target: FolderDialogTarget;
  onClose(): void;
}): ReactElement {
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const nameId = useId();
  const errorId = useId();
  const submittingRef = useRef(false);

  const initialName = target.mode === 'rename' ? target.folder.name : '';
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: initialName },
  });

  const isPending = isSubmitting || createFolder.isPending || renameFolder.isPending;

  async function save({ name }: FolderFormValues): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      if (target.mode === 'create') {
        await createFolder.mutateAsync({
          projectId: target.projectId,
          parentId: target.parentId,
          name,
        });
        toast.success('Folder created');
      } else {
        await renameFolder.mutateAsync({
          folderId: target.folder.id,
          name,
        });
        toast.success('Folder renamed');
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
  const title =
    target.mode === 'rename'
      ? 'Rename folder'
      : target.parentName
        ? `New folder in ${target.parentName}`
        : 'New folder';
  const description =
    target.mode === 'rename'
      ? 'Choose a new name for this folder.'
      : 'Organize schedules inside this project.';

  return (
    <FormDialog
      title={title}
      description={description}
      width="sm"
      isDirty={isDirty}
      isPending={isPending}
      submitLabel={target.mode === 'rename' ? 'Save' : 'Create folder'}
      pendingLabel={target.mode === 'rename' ? 'Saving…' : 'Creating…'}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} className="text-xs font-semibold">
          Folder name
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
