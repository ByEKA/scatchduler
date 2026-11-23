import { FolderOpen, Info, Layers, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import { FOCUS_OUTLINE_CLASSES, MENU_ITEM_FOCUS_CLASSES } from '@/components/layout/top-bar-parts';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ID, ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { DeleteProjectDialog } from '@/features/projects/DeleteProjectDialog';
import { canEdit, isOwner } from '@/features/workspaces/roles';
import { useWorkspacePrograms } from '@/hooks/usePrograms';
import { useUpdateProject } from '@/hooks/useProjects';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec §6.7: items 32 tall with 16 px icons, and the ring-colored outline on keyboard focus
// (P3 core spec §6.6).
const ITEM_CLASSES = cn('h-8 py-0', MENU_ITEM_FOCUS_CLASSES);

// Opaque, so the trigger reads on a cover photo as well as in a table row.
const TRIGGER_CLASSES = cn(
  'flex size-7 items-center justify-center rounded-md bg-card text-muted-foreground ring-1 ring-edge hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
  FOCUS_OUTLINE_CLASSES,
);

/**
 * A project's actions (P3 core spec §6.2, P4 later §7.3.1): "Open", then "Edit project" for
 * editors and owners or "Project details" for viewers, optional "Program" submenu for editors and
 * owners when workspace programs exist, then "Delete project" for owners.
 */
export function ProjectMenu({
  project,
  workspace,
}: {
  project: ProjectSummary;
  workspace: WorkspaceSummary;
}): ReactElement {
  const { openDialog } = useDialogs();
  const programsQuery = useWorkspacePrograms(workspace.id);
  const updateProject = useUpdateProject();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // The dialog an item chose. It opens once the menu has closed (onCloseAutoFocus): the menu is
  // modal, so until then it keeps focus inside and pointer events away from the page.
  const chosenAction = useRef<(() => void) | null>(null);
  const actingRef = useRef(false);
  const editable = canEdit(workspace);
  const programs = programsQuery.data ?? [];
  const showProgramMenu = editable && (programs.length > 0 || project.programId !== null);

  async function handleAssignProgram(programId: ID | null): Promise<void> {
    if (actingRef.current || project.programId === programId) return;
    actingRef.current = true;
    try {
      await updateProject.mutateAsync({
        workspaceId: project.workspaceId,
        input: {
          projectId: project.id,
          programId,
          code: project.code,
          name: project.name,
          description: project.description,
          cover: 'keep',
          ...(project.currentSchedule === null ? { statusDate: project.statusDate } : {}),
          attributes: project.attributes,
          client: project.client,
          location: project.location,
        },
      });
      toast.success(programId === null ? 'Removed from program' : 'Program updated');
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
          // A choice the last closing didn't run (the menu unmounted first) is dropped.
          if (open) chosenAction.current = null;
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Actions for ${project.name}`}
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
              // Closed without a choice: Radix gives focus back to the trigger.
              const action = chosenAction.current;
              if (action === null) return;
              chosenAction.current = null;
              event.preventDefault();
              // A dialog gives focus back to whatever had focus when it opened, so that has to be
              // the trigger; the chosen item has gone with the menu.
              triggerRef.current?.focus();
              action();
            }}
            className={cn(
              POPOVER_SHELL_CLASSES,
              'max-h-(--radix-dropdown-menu-content-available-height) w-48 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto',
            )}
          >
            <DropdownMenuItem asChild className={ITEM_CLASSES}>
              <Link to={`/w/${project.workspaceId}/p/${project.id}/files`}>
                <FolderOpen aria-hidden="true" />
                Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className={ITEM_CLASSES}
              onSelect={() => {
                chosenAction.current = () =>
                  openDialog('editProject', {
                    workspaceId: project.workspaceId,
                    projectId: project.id,
                  });
              }}
            >
              {editable ? <Pencil aria-hidden="true" /> : <Info aria-hidden="true" />}
              {editable ? 'Edit project' : 'Project details'}
            </DropdownMenuItem>
            {showProgramMenu && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={ITEM_CLASSES}>
                  <Layers aria-hidden="true" />
                  Program
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className={cn(POPOVER_SHELL_CLASSES, 'w-52')}>
                    <DropdownMenuItem
                      className={ITEM_CLASSES}
                      disabled={project.programId === null}
                      onSelect={() => {
                        void handleAssignProgram(null);
                      }}
                    >
                      None
                    </DropdownMenuItem>
                    {programs.map((program) => (
                      <DropdownMenuItem
                        key={program.id}
                        className={ITEM_CLASSES}
                        disabled={project.programId === program.id}
                        onSelect={() => {
                          void handleAssignProgram(program.id);
                        }}
                      >
                        <span className="truncate">{program.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            {isOwner(workspace) && (
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
                  Delete project
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuPrimitive.Content>
        </DropdownMenuPrimitive.Portal>
      </DropdownMenu>
      {isOwner(workspace) && (
        <DeleteProjectDialog project={project} open={deleteOpen} onOpenChange={setDeleteOpen} />
      )}
    </>
  );
}
