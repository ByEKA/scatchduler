import { AlertTriangle, ChartGantt, Download, FileUp, Info, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { useBlocker, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ScheduleDocument } from '@/data/schedule-types';
import type { Schedule, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { CycleErrorBanner } from '@/features/schedule/CycleErrorBanner';
import { DirtyLeaveDialog } from '@/features/schedule/DirtyLeaveDialog';
import type { GanttZoom } from '@/features/schedule/gantt/timescale';
import { buildVisibleRows, SCHEDULE_ROW_HEIGHT } from '@/features/schedule/rows';
import {
  ScheduleDetailsPanel,
  type DetailsTab,
} from '@/features/schedule/ScheduleDetailsPanel';
import { ScheduleGantt, type ScheduleGanttHandle } from '@/features/schedule/ScheduleGantt';
import { ScheduleGrid } from '@/features/schedule/ScheduleGrid';
import { ScheduleSearch } from '@/features/schedule/ScheduleSearch';
import { ScheduleStatusBar } from '@/features/schedule/ScheduleStatusBar';
import { ScheduleToolbar } from '@/features/schedule/ScheduleToolbar';
import { findMatchingActivityIds } from '@/features/schedule/search';
import { SplitPane } from '@/features/schedule/SplitPane';
import { useScheduleEditor } from '@/features/schedule/useScheduleEditor';
import { canEdit } from '@/features/workspaces/roles';
import { useDownloadSourceFile } from '@/hooks/useImportReport';
import { useProject } from '@/hooks/useProjects';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useScheduleDocument } from '@/hooks/useScheduleDocument';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { errorMessage, isNotFoundError } from '@/lib/format';
import { readKey, UI_SCHEDULE_DETAILS_KEY, writeKey } from '@/lib/storage';
import { NotFoundPage } from '@/pages/NotFoundPage';

function ScheduleEditorWorkspace({
  schedule,
  workspace,
  initialDocument,
  initialRevision,
}: {
  schedule: Schedule;
  workspace: WorkspaceSummary;
  initialDocument: ScheduleDocument;
  initialRevision: number;
}): ReactElement {
  const editor = useScheduleEditor({
    schedule,
    initialDocument,
    initialRevision,
  });
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<ScheduleGanttHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [zoom, setZoom] = useState<GanttZoom>('week');
  const [searchQuery, setSearchQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [filterActive, setFilterActive] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(
    () => readKey(UI_SCHEDULE_DETAILS_KEY) === '1',
  );
  const [detailsTab, setDetailsTab] = useState<DetailsTab>('details');

  const toggleDetails = useCallback(() => {
    setDetailsOpen((prev) => {
      const next = !prev;
      writeKey(UI_SCHEDULE_DETAILS_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const matches = useMemo(
    () => findMatchingActivityIds(editor.document.activities, searchQuery),
    [editor.document.activities, searchQuery],
  );

  const filterActivityIds = useMemo<ReadonlySet<string> | null>(() => {
    if (!filterActive || searchQuery.trim() === '') return null;
    return new Set(matches);
  }, [filterActive, matches, searchQuery]);

  const visibleRows = useMemo(
    () =>
      buildVisibleRows(
        editor.document,
        editor.summary,
        editor.rollups,
        editor.collapsedWbsIds,
        filterActivityIds,
      ),
    [editor.collapsedWbsIds, editor.document, editor.rollups, editor.summary, filterActivityIds],
  );

  const handleGanttScrollTop = useCallback((nextTop: number) => {
    setScrollTop(nextTop);
    if (gridScrollRef.current && gridScrollRef.current.scrollTop !== nextTop) {
      gridScrollRef.current.scrollTop = nextTop;
    }
  }, []);

  const jumpAndScrollToActivity = useCallback(
    (activityId: string) => {
      editor.jumpToActivity(activityId);
      const targetIdx = visibleRows.findIndex((r) => r.key === `act:${activityId}`);
      if (targetIdx >= 0) {
        const nextTop = Math.max(0, (targetIdx - 2) * SCHEDULE_ROW_HEIGHT);
        handleGanttScrollTop(nextTop);
      }
    },
    [editor, handleGanttScrollTop, visibleRows],
  );

  const handleSearchQueryChange = useCallback(
    (nextQuery: string) => {
      setSearchQuery(nextQuery);
      setMatchIndex(0);
      const nextMatches = findMatchingActivityIds(editor.document.activities, nextQuery);
      if (nextMatches.length > 0) {
        jumpAndScrollToActivity(nextMatches[0]!);
      }
    },
    [editor.document.activities, jumpAndScrollToActivity],
  );

  const handleSearchStep = useCallback(
    (delta: 1 | -1) => {
      if (matches.length === 0) return;
      const nextIdx = (matchIndex + delta + matches.length) % matches.length;
      setMatchIndex(nextIdx);
      jumpAndScrollToActivity(matches[nextIdx]!);
    },
    [jumpAndScrollToActivity, matchIndex, matches],
  );

  // Dirty-leave guards: React Router navigation blocker + browser beforeunload (spec §7.2, D7, V8).
  const blocker = useBlocker(editor.dirty);

  useEffect(() => {
    if (!editor.dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editor.dirty]);

  // Global keyboard shortcuts: Ctrl+F, F5, Ctrl+S, Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y (spec §7.2, S11).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === 'f') {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === 'F5') {
        event.preventDefault();
        void editor.calculate();
        return;
      }

      if (mod && key === 's') {
        event.preventDefault();
        if (editor.mode === 'edit' && editor.dirty) {
          void editor.save();
        }
        return;
      }

      const target = event.target as HTMLElement | null;
      const inInput =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (!inInput && editor.mode === 'edit' && mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }

      if (!inInput && editor.mode === 'edit' && mod && key === 'y') {
        event.preventDefault();
        editor.redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);

  return (
    <div className="flex h-[calc(100dvh-48px-36px)] min-h-[480px] flex-col gap-2">
      <div className="flex items-center gap-2">
        <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
        {schedule.code !== null && schedule.code.trim() !== '' && (
          <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs font-medium text-muted-foreground">
            {schedule.code}
          </span>
        )}
      </div>

      <ScheduleToolbar
        schedule={schedule}
        workspace={workspace}
        editor={editor}
        zoom={zoom}
        onZoomChange={setZoom}
        onZoomToFit={() => ganttRef.current?.zoomToFit()}
        detailsOpen={detailsOpen}
        onToggleDetails={toggleDetails}
        onJumpToActivity={jumpAndScrollToActivity}
        searchSlot={
          <ScheduleSearch
            inputRef={searchInputRef}
            query={searchQuery}
            onQueryChange={handleSearchQueryChange}
            matches={matches}
            activeIndex={matchIndex}
            onStep={handleSearchStep}
            filterActive={filterActive}
            onToggleFilter={() => setFilterActive((prev) => !prev)}
          />
        }
      />

      {editor.cycleError !== null && (
        <CycleErrorBanner
          error={editor.cycleError}
          onJumpToCycleActivity={(activityId) => {
            jumpAndScrollToActivity(activityId);
            setDetailsTab('relationships');
            setDetailsOpen(true);
            writeKey(UI_SCHEDULE_DETAILS_KEY, '1');
          }}
        />
      )}

      {editor.mode === 'edit' && editor.lock.lost && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs font-medium text-warning-foreground"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span>Your edit lock expired. Copy your changes or reload the schedule.</span>
        </div>
      )}

      <SplitPane
        left={
          <ScheduleGrid
            rows={visibleRows}
            selectedKey={editor.selectedKey}
            showCritical={editor.showCritical}
            mode={editor.mode}
            document={editor.document}
            onDispatch={editor.dispatch}
            onSelectKey={editor.selectKey}
            onToggleWbs={editor.toggleWbs}
            scrollContainerRef={gridScrollRef}
            onScroll={setScrollTop}
          />
        }
        right={
          <ScheduleGantt
            ref={ganttRef}
            rows={visibleRows}
            document={editor.document}
            summary={editor.summary}
            selectedKey={editor.selectedKey}
            showCritical={editor.showCritical}
            showLinks={editor.showLinks}
            drivingPath={editor.drivingPath}
            zoom={zoom}
            onZoomChange={setZoom}
            onSelectKey={editor.selectKey}
            scrollTop={scrollTop}
            onScrollTopChange={handleGanttScrollTop}
          />
        }
      />

      {detailsOpen && (
        <ScheduleDetailsPanel
          document={editor.document}
          summary={editor.summary}
          rollups={editor.rollups}
          selectedKey={editor.selectedKey}
          mode={editor.mode}
          activeTab={detailsTab}
          onTabChange={setDetailsTab}
          onClose={() => {
            setDetailsOpen(false);
            writeKey(UI_SCHEDULE_DETAILS_KEY, '0');
          }}
          onJumpToActivity={jumpAndScrollToActivity}
          onDispatch={editor.dispatch}
        />
      )}

      <ScheduleStatusBar
        code={schedule.code ?? schedule.name}
        statusDate={editor.document.settings.statusDate}
        displayMode={editor.document.settings.displayMode}
        profile={editor.document.settings.profile}
        stale={editor.stale}
        totalActivities={editor.document.activities.length}
        shownActivities={filterActivityIds !== null ? matches.length : editor.document.activities.length}
        isFiltered={filterActivityIds !== null}
        zoom={zoom}
        durationMs={editor.summary?.durationMs ?? null}
      />

      <DirtyLeaveDialog
        open={blocker.state === 'blocked'}
        onKeep={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
        onDiscard={() => {
          void editor.lock.release().catch(() => undefined);
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />

      <div role="status" aria-live="polite" className="sr-only">
        {editor.lastAnnouncement}
      </div>
    </div>
  );
}

function ScheduleDocumentHost({
  schedule,
  workspace,
}: {
  schedule: Schedule;
  workspace: WorkspaceSummary;
}): ReactElement {
  const docState = useScheduleDocument(schedule, workspace.myRole);
  const downloadSource = useDownloadSourceFile();

  if (docState.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-[460px] w-full" />
      </div>
    );
  }

  if (docState.status === 'materializing') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
          <span className="text-sm text-muted-foreground">Preparing schedule…</span>
        </div>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-[460px] w-full" />
      </div>
    );
  }

  if (docState.status === 'needs_editor') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
        <EmptyState
          icon={Info}
          title="Not ready yet"
          description="This schedule hasn't been opened by an editor yet."
        />
      </div>
    );
  }

  if (docState.status === 'legacy_import') {
    return (
      <div className="flex flex-col gap-4">
        <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
        <EmptyState
          icon={Download}
          title="Re-import needed"
          description="This schedule was imported before the schedule editor was added. Download the original file and import it again to open it."
          action={
            <Button
              type="button"
              size="sm"
              disabled={downloadSource.isPending}
              onClick={() => {
                void downloadSource
                  .mutateAsync(schedule.id)
                  .catch((err) => toast.error(errorMessage(err)));
              }}
            >
              <Download aria-hidden="true" />
              Download original file
            </Button>
          }
        />
      </div>
    );
  }

  if (docState.status === 'error') {
    return <SectionError error={docState.error} onRetry={() => window.location.reload()} className="py-16" />;
  }

  return (
    <ScheduleEditorWorkspace
      key={schedule.id}
      schedule={schedule}
      workspace={workspace}
      initialDocument={docState.document}
      initialRevision={docState.dataRevision}
    />
  );
}

/**
 * Schedule editor route (`/w/:workspaceId/p/:projectId/schedule`, spec §7.2). Resolves
 * `?scheduleId=` or the project's current schedule, handles unmaterialized/legacy/empty states,
 * and mounts the interactive schedule editor workspace.
 */
export function SchedulePage(): ReactElement {
  const { workspaceId, projectId } = useParams();
  const [searchParams] = useSearchParams();
  const { openDialog } = useDialogs();
  const workspaces = useWorkspaces();
  const projectQuery = useProject(workspaceId, projectId);
  const project = projectQuery.data;
  const schedulesQuery = useProjectSchedules(project?.id);

  if (workspaceId === undefined || projectId === undefined) return <NotFoundPage />;

  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  if (isNotFoundError(projectQuery.error)) return <NotFoundPage />;
  if (project !== undefined && project.workspaceId !== workspaceId) return <NotFoundPage />;
  if (workspaces.data !== undefined && workspace === undefined) return <NotFoundPage />;

  if (project === undefined && projectQuery.isError) {
    return (
      <SectionError
        error={projectQuery.error}
        onRetry={() => void projectQuery.refetch()}
        className="py-16"
      />
    );
  }
  if (workspaces.data === undefined && workspaces.isError) {
    return (
      <SectionError
        error={workspaces.error}
        onRetry={() => void workspaces.refetch()}
        className="py-16"
      />
    );
  }
  if (schedulesQuery.data === undefined && schedulesQuery.isError) {
    return (
      <SectionError
        error={schedulesQuery.error}
        onRetry={() => void schedulesQuery.refetch()}
        className="py-16"
      />
    );
  }
  if (project === undefined || workspace === undefined || schedulesQuery.data === undefined) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-[460px] w-full" />
      </div>
    );
  }

  const allSchedules = schedulesQuery.data;
  const nonArchived = allSchedules.filter((s) => s.archivedAt === null);
  const requestedId = searchParams.get('scheduleId');
  const schedule = requestedId
    ? allSchedules.find((s) => s.id === requestedId)
    : (nonArchived.find((s) => s.isCurrent) ?? nonArchived[0]);

  if (requestedId !== null && schedule === undefined) {
    return <NotFoundPage />;
  }

  if (schedule === undefined) {
    const editable = canEdit(workspace);
    return (
      <EmptyState
        icon={ChartGantt}
        title="No schedules yet"
        description={
          editable
            ? 'Create a blank schedule or import one from your planning tool.'
            : 'Schedules in this project will appear here.'
        }
        action={
          editable ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => openDialog('newSchedule', { projectId: project.id })}
              >
                <Plus aria-hidden="true" />
                New schedule
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => openDialog('importSchedule', { projectId: project.id })}
                className="border-input bg-card dark:bg-card"
              >
                <FileUp aria-hidden="true" />
                Import schedule
              </Button>
            </div>
          ) : undefined
        }
      />
    );
  }

  return <ScheduleDocumentHost key={schedule.id} schedule={schedule} workspace={workspace} />;
}
