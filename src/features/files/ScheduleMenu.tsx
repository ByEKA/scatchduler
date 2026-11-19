import {
  Archive,
  ArchiveRestore,
  Check,
  Download,
  FileText,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { FOCUS_OUTLINE_CLASSES, MENU_ITEM_FOCUS_CLASSES } from '@/components/layout/top-bar-parts';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ProjectSummary, Schedule, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { DeleteScheduleDialog } from '@/features/files/DeleteScheduleDialog';
import { canEdit, isOwner } from '@/features/workspaces/roles';
import { useDownloadSourceFile } from '@/hooks/useImportReport';
import { useSetCurrentSchedule, useSetSchedulesArchived } from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

/** The disabled "Open" item's explanation until Phase 4's schedule editor exists (spec §6.1, D16). */
const EDITOR_NOT_AVAILABLE = "The schedule editor isn't available yet.";

// Spec §6.7: items 32 tall with 16 px icons, and the ring-colored outline on keyboard focus (§6.6).
const ITEM_CLASSES = cn('h-8 py-0', MENU_ITEM_FOCUS_CLASSES);

const TRIGGER_CLASSES = cn(
  'flex size-7 items-center justify-center rounded-md bg-card text-muted-foreground ring-1 ring-edge hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
  FOCUS_OUTLINE_CLASSES,
);

/**
 * Row actions for a schedule on the Project files page (spec §6.3, §6.1, D11, D16). Leaves out
 * actions the caller's role or the schedule's current/archived state forbid; keeps "Open" disabled
 * with its muted note until Phase 4.
 */
export function ScheduleMenu({
  schedule,
  schedules,
  project,
  workspace,
}: {
  schedule: Schedule;
  schedules: readonly Schedule[];
  project: ProjectSummary;
  workspace: WorkspaceSummary;
}): ReactElement {
  const { openDialog } = useDialogs();
  const setCurrent = useSetCurrentSchedule();
  const setArchived = useSetSchedulesArchived();
  const downloadSource = useDownloadSourceFile();
  const openHintId = useId();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Dialog-opening choices run once the modal menu has closed (onCloseAutoFocus), so focus returns
  // to the trigger first and pointer events are unlocked before the dialog mounts.
  const chosenAction = useRef<(() => void) | null>(null);
  // Guards rapid double triggers on direct mutations.
  const actingRef = useRef(false);

  const editable = canEdit(workspace);
  const owner = isOwner(workspace);
  const isArchived = schedule.archivedAt !== null;
  const canMakeCurrent = editable && !schedule.isCurrent && !isArchived;
  const canArchive = editable && !schedule.isCurrent && !isArchived;
  const canRestore = editable && isArchived;
  const canDownload = schedule.source === 'import';
  const canViewReport = schedule.hasImportReport;
  // R3: the current schedule can be deleted only when it is the project's sole schedule.
  const canDelete = owner && (!schedule.isCurrent || schedules.length <= 1);

  async function handleMakeCurrent(): Promise<void> {
    if (actingRef.current) return;
    actingRef.current = true;
    try {
      await setCurrent.mutateAsync(schedule.id);
      toast.success('Schedule is now current');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      actingRef.current = false;
    }
  }

  async function handleSetArchived(archived: boolean): Promise<void> {
    if (actingRef.current) return;
    actingRef.current = true;
    try {
      await setArchived.mutateAsync({ scheduleIds: [schedule.id], archived });
      toast.success(archived ? 'Schedule archived' : 'Schedule restored');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      actingRef.current = false;
    }
  }

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) chosenAction.current = null;
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Actions for ${schedule.name}`}
            className={TRIGGER_CLASSES}
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuPrimitive.Portal>
          <DropdownMenuPrimitive.Content
            align="end"
            sideOffset={6}
            onCloseAutoFocus={(event) => {
              const action = chosenAction.current;
              if (action === null) return;
              chosenAction.current = null;
              event.preventDefault();
              triggerRef.current?.focus();
              action();
            }}
            className={cn(
              POPOVER_SHELL_CLASSES,
              'max-h-(--radix-dropdown-menu-content-available-height) w-64 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
            )}
          >
            <DropdownMenuItem
              disabled
              aria-describedby={openHintId}
              className={cn('flex-col items-start gap-0.5 py-1.5', MENU_ITEM_FOCUS_CLASSES)}
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>Open</span>
              </span>
              <span id={openHintId} className="pl-6 text-xs text-muted-foreground">
                {EDITOR_NOT_AVAILABLE}
              </span>
            </DropdownMenuItem>
            {canMakeCurrent && (
              <DropdownMenuItem
                className={ITEM_CLASSES}
                onSelect={() => {
                  void handleMakeCurrent();
                }}
              >
                <Check aria-hidden="true" />
                Make current
              </DropdownMenuItem>
            )}
            {editable && (
              <DropdownMenuItem
                className={ITEM_CLASSES}
                onSelect={() => {
                  chosenAction.current = () =>
                    openDialog('scheduleDetails', {
                      projectId: project.id,
                      scheduleId: schedule.id,
                    });
                }}
              >
                <Pencil aria-hidden="true" />
                Edit details
              </DropdownMenuItem>
            )}
            {canArchive && (
              <DropdownMenuItem
                className={ITEM_CLASSES}
                onSelect={() => {
                  void handleSetArchived(true);
                }}
              >
                <Archive aria-hidden="true" />
                Archive
              </DropdownMenuItem>
            )}
            {canRestore && (
              <DropdownMenuItem
                className={ITEM_CLASSES}
                onSelect={() => {
                  void handleSetArchived(false);
                }}
              >
                <ArchiveRestore aria-hidden="true" />
                Restore
              </DropdownMenuItem>
            )}
            {canDownload && (
              <DropdownMenuItem
                className={ITEM_CLASSES}
                onSelect={() => {
                  if (!downloadSource.isPending) downloadSource.mutate(schedule.id);
                }}
              >
                <Download aria-hidden="true" />
                Download original file
              </DropdownMenuItem>
            )}
            {canViewReport && (
              <DropdownMenuItem
                className={ITEM_CLASSES}
                onSelect={() => {
                  chosenAction.current = () =>
                    openDialog('importReport', {
                      projectId: project.id,
                      scheduleId: schedule.id,
                    });
                }}
              >
                <FileText aria-hidden="true" />
                View import report
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className={ITEM_CLASSES}
                  onSelect={() => {
                    chosenAction.current = () => setDeleteOpen(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenu>
      {owner && (
        <DeleteScheduleDialog schedule={schedule} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
