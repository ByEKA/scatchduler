import {
  AlertTriangle,
  Check,
  FolderPlus,
  GitBranch,
  Link2,
  Lock,
  Maximize2,
  PanelBottom,
  Pencil,
  Play,
  Plus,
  Redo2,
  Route,
  Save,
  Trash2,
  Undo2,
  Unlock,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toast } from 'sonner';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Schedule, WorkspaceSummary } from '@/data/types';
import { DirtyLeaveDialog } from '@/features/schedule/DirtyLeaveDialog';
import type { GanttZoom } from '@/features/schedule/gantt/timescale';
import { ScheduleSettingsPopover } from '@/features/schedule/ScheduleSettingsPopover';
import type { ScheduleEditorController } from '@/features/schedule/useScheduleEditor';
import { canEdit, isOwner, VIEWER_HINT } from '@/features/workspaces/roles';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface ScheduleToolbarProps {
  schedule: Schedule;
  workspace: WorkspaceSummary;
  editor: ScheduleEditorController;
  zoom: GanttZoom;
  onZoomChange(zoom: GanttZoom): void;
  onZoomToFit(): void;
  detailsOpen: boolean;
  onToggleDetails(): void;
  settingsSlot?: ReactNode;
  warningsSlot?: ReactNode;
  searchSlot?: ReactNode;
}

const OUTLINE_CLASSES = 'border-input bg-card dark:bg-card';

const ZOOM_LABELS: Record<GanttZoom, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  quarter: 'Quarter',
};

/**
 * Full Schedule editor toolbar handling View/Edit lifecycle, lock pills and owner Force Unlock,
 * Undo/Redo, activity/WBS authoring, Calculate (F5), timeline toggles, zoom and search
 * (spec §7.2, R1–R5, S11).
 */
export function ScheduleToolbar({
  schedule,
  workspace,
  editor,
  zoom,
  onZoomChange,
  onZoomToFit,
  detailsOpen,
  onToggleDetails,
  settingsSlot,
  warningsSlot,
  searchSlot,
}: ScheduleToolbarProps): ReactElement {
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const unlockingRef = useRef(false);

  const isArchived = schedule.archivedAt !== null;
  const editable = canEdit(workspace);
  const owner = isOwner(workspace);
  const activeLock = editor.lock.lock;
  const lockedByOther = activeLock !== null && !editor.lock.isMine;

  const handleAddActivity = () => {
    let wbsId: string | null = null;
    let afterActivityId: string | null = null;
    if (editor.selectedKey?.startsWith('wbs:')) {
      wbsId = editor.selectedKey.slice(4);
    } else if (editor.selectedActivityId !== null) {
      const selectedAct = editor.document.activities.find(
        (a) => a.id === editor.selectedActivityId,
      );
      wbsId = selectedAct?.wbsId ?? null;
      afterActivityId = editor.selectedActivityId;
    }
    const res = editor.dispatch({ type: 'addActivity', wbsId, afterActivityId });
    if (!res.ok) toast.error(res.error);
  };

  const handleAddWbs = () => {
    let parentId: string | null = null;
    let afterWbsId: string | null = null;
    if (editor.selectedKey?.startsWith('wbs:')) {
      parentId = editor.selectedKey.slice(4);
      afterWbsId = parentId;
    }
    const res = editor.dispatch({ type: 'addWbsNode', parentId, afterWbsId });
    if (!res.ok) toast.error(res.error);
  };

  const handleDeleteSelected = () => {
    if (editor.selectedKey === null) return;
    if (editor.selectedKey.startsWith('act:')) {
      const res = editor.dispatch({
        type: 'deleteActivities',
        activityIds: [editor.selectedKey.slice(4)],
      });
      if (!res.ok) toast.error(res.error);
    } else if (editor.selectedKey.startsWith('wbs:')) {
      const res = editor.dispatch({
        type: 'deleteWbsNode',
        wbsId: editor.selectedKey.slice(4),
      });
      if (!res.ok) toast.error(res.error);
    }
  };

  const handleForceUnlock = async () => {
    if (unlockingRef.current) return;
    unlockingRef.current = true;
    try {
      await editor.lock.forceRelease();
      setUnlockOpen(false);
      toast.success('Schedule unlocked');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      unlockingRef.current = false;
    }
  };

  return (
    <div
      role="toolbar"
      aria-label="Schedule toolbar"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5"
    >
      {/* Left: Edit lifecycle & authoring */}
      <div className="flex flex-wrap items-center gap-1.5">
        {editor.mode === 'view' ? (
          isArchived ? (
            <span className="inline-flex h-7 items-center rounded-md bg-muted px-2 text-xs font-medium text-muted-foreground">
              Archived · read-only
            </span>
          ) : lockedByOther ? (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-warning-border bg-warning-bg px-2 text-xs font-medium text-warning-foreground">
                <Lock className="size-3.5" aria-hidden="true" />
                Locked by {activeLock.userName}
              </span>
              {owner && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className={OUTLINE_CLASSES}
                  onClick={() => setUnlockOpen(true)}
                >
                  <Unlock className="size-3.5" aria-hidden="true" />
                  Unlock
                </Button>
              )}
            </div>
          ) : editable ? (
            <Button
              type="button"
              size="xs"
              onClick={() => {
                void editor.enterEdit();
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="xs"
                  aria-disabled="true"
                  onClick={(event) => event.preventDefault()}
                  className="cursor-not-allowed opacity-60 hover:bg-primary"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={6}>{VIEWER_HINT}</TooltipContent>
            </Tooltip>
          )
        ) : (
          <>
            <Button
              type="button"
              size="xs"
              disabled={!editor.dirty || editor.isSaving}
              onClick={() => {
                void editor.save();
              }}
            >
              <Save className="size-3.5" aria-hidden="true" />
              {editor.isSaving ? 'Saving…' : 'Save'}
            </Button>
            {editor.dirty ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className={OUTLINE_CLASSES}
                onClick={() => setDiscardOpen(true)}
              >
                <X className="size-3.5" aria-hidden="true" />
                Discard
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className={OUTLINE_CLASSES}
                onClick={() => {
                  void editor.exitEdit();
                }}
              >
                <Check className="size-3.5" aria-hidden="true" />
                Done editing
              </Button>
            )}

            <Separator orientation="vertical" className="mx-0.5 h-5" />

            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Undo"
              disabled={!editor.canUndo}
              onClick={editor.undo}
            >
              <Undo2 className="size-3.5" aria-hidden="true" />
              <span className="hidden xl:inline">Undo</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-label="Redo"
              disabled={!editor.canRedo}
              onClick={editor.redo}
            >
              <Redo2 className="size-3.5" aria-hidden="true" />
              <span className="hidden xl:inline">Redo</span>
            </Button>

            <Separator orientation="vertical" className="mx-0.5 h-5" />

            <Button
              type="button"
              variant="outline"
              size="xs"
              className={OUTLINE_CLASSES}
              onClick={handleAddActivity}
            >
              <Plus className="size-3.5" aria-hidden="true" />
              + Activity
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className={OUTLINE_CLASSES}
              onClick={handleAddWbs}
            >
              <FolderPlus className="size-3.5" aria-hidden="true" />
              + WBS
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={editor.selectedKey === null}
              onClick={handleDeleteSelected}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Delete
            </Button>
          </>
        )}

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Calculation */}
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={editor.isCalculating}
          className={OUTLINE_CLASSES}
          onClick={() => {
            void editor.calculate();
          }}
        >
          <Play className="size-3.5" aria-hidden="true" />
          {editor.isCalculating ? 'Calculating…' : 'Calculate'}
        </Button>

        {editor.stale && (
          <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-warning-border bg-warning-bg px-1.5 text-2xs font-medium text-warning-foreground">
            <AlertTriangle className="size-3" aria-hidden="true" />
            Recalculate needed
          </span>
        )}

        {settingsSlot ?? (
          <ScheduleSettingsPopover
            document={editor.document}
            mode={editor.mode}
            onDispatch={editor.dispatch}
          />
        )}
        {warningsSlot}
      </div>

      {/* Right: Timeline toggles, zoom, details & search */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant={editor.showCritical ? 'secondary' : 'outline'}
          size="xs"
          aria-pressed={editor.showCritical}
          onClick={() => editor.setShowCritical(!editor.showCritical)}
          className={cn(
            !editor.showCritical && OUTLINE_CLASSES,
            editor.showCritical && 'border border-gantt-critical/40',
          )}
        >
          <Route className="size-3.5" aria-hidden="true" />
          Critical path
        </Button>

        <Button
          type="button"
          variant={editor.drivingPath !== null ? 'secondary' : 'outline'}
          size="xs"
          aria-pressed={editor.drivingPath !== null}
          disabled={editor.selectedActivityId === null || editor.summary === null}
          onClick={() => {
            void editor.toggleDrivingPath();
          }}
          className={cn(
            editor.drivingPath === null && OUTLINE_CLASSES,
            editor.drivingPath !== null && 'border border-ring/50',
          )}
        >
          <GitBranch className="size-3.5" aria-hidden="true" />
          Driving path
        </Button>

        <Button
          type="button"
          variant={editor.showLinks ? 'secondary' : 'outline'}
          size="xs"
          aria-pressed={editor.showLinks}
          onClick={() => editor.setShowLinks(!editor.showLinks)}
          className={cn(!editor.showLinks && OUTLINE_CLASSES)}
        >
          <Link2 className="size-3.5" aria-hidden="true" />
          Links
        </Button>

        <Select value={zoom} onValueChange={(v) => onZoomChange(v as GanttZoom)}>
          <SelectTrigger aria-label="Zoom level" className="h-7 w-24 text-xs">
            <SelectValue>{ZOOM_LABELS[zoom]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Day</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="quarter">Quarter</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="xs"
          className={OUTLINE_CLASSES}
          onClick={onZoomToFit}
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
          Zoom to fit
        </Button>

        <Button
          type="button"
          variant={detailsOpen ? 'secondary' : 'outline'}
          size="xs"
          aria-pressed={detailsOpen}
          onClick={onToggleDetails}
          className={cn(!detailsOpen && OUTLINE_CLASSES)}
        >
          <PanelBottom className="size-3.5" aria-hidden="true" />
          Details
        </Button>

        {searchSlot}
      </div>

      {/* Owner-only Force Unlock confirmation */}
      <AlertDialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {activeLock?.userName ?? 'Another user'} may lose unsaved changes if you unlock it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void handleForceUnlock();
              }}
            >
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Discard unsaved changes confirmation */}
      <DirtyLeaveDialog
        open={discardOpen}
        onKeep={() => setDiscardOpen(false)}
        onDiscard={() => {
          setDiscardOpen(false);
          void editor.discard();
        }}
      />
    </div>
  );
}
