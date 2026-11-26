import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Inbox,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';
import { FOCUS_OUTLINE_CLASSES, MENU_ITEM_FOCUS_CLASSES } from '@/components/layout/top-bar-parts';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Folder, ID, Schedule, WorkspaceSummary } from '@/data/types';
import { FolderDialog, type FolderDialogTarget } from '@/features/files/FolderDialog';
import { canEdit, VIEWER_HINT } from '@/features/workspaces/roles';
import { useDeleteFolder, useProjectFolders } from '@/hooks/useFolders';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

export type FolderSelection = 'all' | 'unfiled' | ID;

interface FolderTreeNode {
  folder: Folder;
  depth: number;
  children: FolderTreeNode[];
}

function buildFolderTree(folders: readonly Folder[]): FolderTreeNode[] {
  const byParent = new Map<ID | null, Folder[]>();
  for (const folder of folders) {
    const bucket = byParent.get(folder.parentId) ?? [];
    bucket.push(folder);
    byParent.set(folder.parentId, bucket);
  }

  const buildLevel = (parentId: ID | null, depth: number): FolderTreeNode[] => {
    const items = byParent.get(parentId) ?? [];
    return items.map((folder) => ({
      folder,
      depth,
      children: depth < 3 ? buildLevel(folder.id, depth + 1) : [],
    }));
  };

  return buildLevel(null, 1);
}

const ITEM_BUTTON_CLASSES = cn(
  'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors',
  FOCUS_OUTLINE_CLASSES,
);

const MENU_ITEM_CLASSES = cn('h-8 py-0', MENU_ITEM_FOCUS_CLASSES);

/**
 * Project Files folder navigation sidebar (spec §7.2.1, R3, R4, S7):
 * - "All schedules" (`all`),
 * - "Unfiled" (`unfiled`),
 * - 3-level folder tree with expand/collapse chevrons, schedule counts, and editor/owner CRUD.
 */
export function FolderSidebar({
  projectId,
  workspace,
  schedules,
  selectedFolder,
  onSelectFolder,
}: {
  projectId: ID;
  workspace: WorkspaceSummary;
  schedules: readonly Schedule[];
  selectedFolder: FolderSelection;
  onSelectFolder(selection: FolderSelection): void;
}): ReactElement {
  const foldersQuery = useProjectFolders(projectId);
  const deleteFolder = useDeleteFolder();
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<ID>>(() => new Set());
  const [dialogTarget, setDialogTarget] = useState<FolderDialogTarget | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);

  const editable = canEdit(workspace);
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const tree = useMemo(() => buildFolderTree(folders), [folders]);

  const counts = useMemo(() => {
    const byFolder = new Map<ID, number>();
    let unfiled = 0;
    for (const schedule of schedules) {
      if (schedule.folderId === null) {
        unfiled += 1;
      } else {
        byFolder.set(schedule.folderId, (byFolder.get(schedule.folderId) ?? 0) + 1);
      }
    }
    return {
      all: schedules.length,
      unfiled,
      byFolder,
    };
  }, [schedules]);

  const toggleCollapse = (folderId: ID) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (!deletingFolder) return;
    const target = deletingFolder;
    try {
      await deleteFolder.mutateAsync(target.id);
      if (selectedFolder === target.id) {
        onSelectFolder(target.parentId ?? 'all');
      }
      toast.success('Folder deleted');
      setDeletingFolder(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const renderNode = (node: FolderTreeNode): ReactElement => {
    const { folder, depth, children } = node;
    const isSelected = selectedFolder === folder.id;
    const isCollapsed = collapsedIds.has(folder.id);
    const hasChildren = children.length > 0;
    const count = counts.byFolder.get(folder.id) ?? 0;

    return (
      <li key={folder.id} className="flex flex-col gap-0.5">
        <div
          className={cn(
            'group flex items-center gap-0.5 rounded-md pr-1',
            isSelected
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
          style={{ paddingLeft: `${(depth - 1) * 12}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isCollapsed ? `Expand ${folder.name}` : `Collapse ${folder.name}`}
              onClick={() => toggleCollapse(folder.id)}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground',
                FOCUS_OUTLINE_CLASSES,
              )}
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="size-3.5" aria-hidden="true" />
              )}
            </button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden="true" />
          )}

          <button
            type="button"
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => onSelectFolder(folder.id)}
            className={cn(ITEM_BUTTON_CLASSES, 'pl-1')}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {isSelected ? (
                <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <FolderIcon className="size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">{folder.name}</span>
            </span>
            <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
              {count}
            </span>
          </button>

          {editable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Manage folder ${folder.name}`}
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                    FOCUS_OUTLINE_CLASSES,
                  )}
                >
                  <MoreHorizontal className="size-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {depth < 3 && (
                  <DropdownMenuItem
                    className={MENU_ITEM_CLASSES}
                    onSelect={() =>
                      setDialogTarget({
                        mode: 'create',
                        projectId,
                        parentId: folder.id,
                        parentName: folder.name,
                      })
                    }
                  >
                    <FolderPlus className="size-3.5" aria-hidden="true" />
                    New subfolder…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className={MENU_ITEM_CLASSES}
                  onSelect={() => setDialogTarget({ mode: 'rename', folder })}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Rename…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  className={MENU_ITEM_CLASSES}
                  onSelect={() => setDeletingFolder(folder)}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Delete…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {hasChildren && !isCollapsed && (
          <ul className="flex flex-col gap-0.5">{children.map(renderNode)}</ul>
        )}
      </li>
    );
  };

  return (
    <nav
      aria-label="Folders"
      className="flex w-full shrink-0 flex-col gap-2 rounded-lg bg-card p-3 ring-1 ring-edge lg:w-56"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-2xs font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          Folders
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={!editable}
          title={editable ? undefined : VIEWER_HINT}
          onClick={() =>
            setDialogTarget({
              mode: 'create',
              projectId,
              parentId: null,
            })
          }
          className="h-6 px-1.5 text-xs"
        >
          <Plus className="size-3.5" aria-hidden="true" />
          New folder
        </Button>
      </div>

      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          aria-current={selectedFolder === 'all' ? 'true' : undefined}
          onClick={() => onSelectFolder('all')}
          className={cn(
            ITEM_BUTTON_CLASSES,
            selectedFolder === 'all'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Layers className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">All schedules</span>
          </span>
          <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
            {counts.all}
          </span>
        </button>

        <button
          type="button"
          aria-current={selectedFolder === 'unfiled' ? 'true' : undefined}
          onClick={() => onSelectFolder('unfiled')}
          className={cn(
            ITEM_BUTTON_CLASSES,
            selectedFolder === 'unfiled'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Inbox className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Unfiled</span>
          </span>
          <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">
            {counts.unfiled}
          </span>
        </button>
      </div>

      {tree.length > 0 && (
        <ul
          aria-label="Project folders"
          className="flex flex-col gap-0.5 border-t border-border pt-2"
        >
          {tree.map(renderNode)}
        </ul>
      )}

      {dialogTarget !== null && (
        <FolderDialog target={dialogTarget} onClose={() => setDialogTarget(null)} />
      )}

      <AlertDialog
        open={deletingFolder !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingFolder(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingFolder ? `Delete ${deletingFolder.name}?` : 'Delete folder?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Child folders and schedules inside it will move to its parent folder. No schedules are
              deleted.
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
              Delete folder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
