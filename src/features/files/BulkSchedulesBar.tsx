import { Archive, ArchiveRestore, FolderInput, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { MENU_ITEM_FOCUS_CLASSES } from '@/components/layout/top-bar-parts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Folder, ID, Schedule, WorkspaceSummary } from '@/data/types';
import { isOwner } from '@/features/workspaces/roles';
import {
  useDeleteSchedules,
  useMoveSchedulesToFolder,
  useSetSchedulesArchived,
} from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

const ITEM_CLASSES = cn('h-8 py-0', MENU_ITEM_FOCUS_CLASSES);
const OUTLINE_BUTTON_CLASSES = 'border-input bg-card dark:bg-card';

/**
 * Bulk actions bar above the Project Files table when one or more schedules are selected
 * (spec §7.2.3, R5, S7).
 */
export function BulkSchedulesBar({
  selectedSchedules,
  allProjectSchedules,
  folders,
  workspace,
  onClearSelection,
}: {
  selectedSchedules: readonly Schedule[];
  allProjectSchedules: readonly Schedule[];
  folders: readonly Folder[];
  workspace: WorkspaceSummary;
  onClearSelection(): void;
}): ReactElement | null {
  const moveToFolder = useMoveSchedulesToFolder();
  const setArchived = useSetSchedulesArchived();
  const deleteSchedules = useDeleteSchedules();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (selectedSchedules.length === 0) return null;

  const owner = isOwner(workspace);
  const selectedIds = selectedSchedules.map((s) => s.id);
  const archivableIds = selectedSchedules
    .filter((s) => !s.isCurrent && s.archivedAt === null)
    .map((s) => s.id);
  const restorableIds = selectedSchedules.filter((s) => s.archivedAt !== null).map((s) => s.id);

  // R3: current schedule can only be deleted when deleting all schedules of the project.
  const deletingAll = selectedIds.length >= allProjectSchedules.length;
  const deletableIds = selectedSchedules
    .filter((s) => !s.isCurrent || deletingAll)
    .map((s) => s.id);

  const busy = moveToFolder.isPending || setArchived.isPending || deleteSchedules.isPending;

  async function handleMove(folderId: ID | null): Promise<void> {
    try {
      await moveToFolder.mutateAsync({ scheduleIds: selectedIds, folderId });
      toast.success(
        selectedIds.length === 1 ? 'Schedule moved' : `Moved ${selectedIds.length} schedules`,
      );
      onClearSelection();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function handleArchive(archived: boolean): Promise<void> {
    const ids = archived ? archivableIds : restorableIds;
    if (ids.length === 0) return;
    try {
      await setArchived.mutateAsync({ scheduleIds: ids, archived });
      toast.success(
        archived
          ? ids.length === 1
            ? 'Schedule archived'
            : `Archived ${ids.length} schedules`
          : ids.length === 1
            ? 'Schedule restored'
            : `Restored ${ids.length} schedules`,
      );
      onClearSelection();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function handleConfirmDelete(): Promise<void> {
    if (deletableIds.length === 0) return;
    try {
      await deleteSchedules.mutateAsync(deletableIds);
      toast.success(
        deletableIds.length === 1 ? 'Schedule deleted' : `Deleted ${deletableIds.length} schedules`,
      );
      setDeleteOpen(false);
      onClearSelection();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-accent/40 px-3 py-2"
    >
      <span className="text-xs font-semibold tabular-nums">
        {selectedSchedules.length} selected
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={busy}
              className={OUTLINE_BUTTON_CLASSES}
            >
              <FolderInput className="size-3.5" aria-hidden="true" />
              Move to folder…
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={cn(POPOVER_SHELL_CLASSES, 'w-48')}>
            <DropdownMenuItem
              className={ITEM_CLASSES}
              onSelect={() => {
                void handleMove(null);
              }}
            >
              Unfiled
            </DropdownMenuItem>
            {folders.map((folder) => (
              <DropdownMenuItem
                key={folder.id}
                className={ITEM_CLASSES}
                onSelect={() => {
                  void handleMove(folder.id);
                }}
              >
                <span className="truncate">{folder.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {archivableIds.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            className={OUTLINE_BUTTON_CLASSES}
            onClick={() => {
              void handleArchive(true);
            }}
          >
            <Archive className="size-3.5" aria-hidden="true" />
            Archive
          </Button>
        )}

        {restorableIds.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={busy}
            className={OUTLINE_BUTTON_CLASSES}
            onClick={() => {
              void handleArchive(false);
            }}
          >
            <ArchiveRestore className="size-3.5" aria-hidden="true" />
            Restore
          </Button>
        )}

        {owner && deletableIds.length > 0 && (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            Delete…
          </Button>
        )}

        <Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onClearSelection}>
          <X className="size-3.5" aria-hidden="true" />
          Clear selection
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletableIds.length === 1
                ? 'Delete 1 schedule?'
                : `Delete ${deletableIds.length} schedules?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Stored original files are deleted too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void handleConfirmDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
