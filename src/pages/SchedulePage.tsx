import { ChartGantt, Download, FileUp, Info, Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ScheduleDocument } from '@/data/schedule-types';
import type { Schedule, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { buildVisibleRows } from '@/features/schedule/rows';
import { ScheduleGrid } from '@/features/schedule/ScheduleGrid';
import { SplitPane } from '@/features/schedule/SplitPane';
import { useScheduleEditor } from '@/features/schedule/useScheduleEditor';
import { canEdit } from '@/features/workspaces/roles';
import { useDownloadSourceFile } from '@/hooks/useImportReport';
import { useProject } from '@/hooks/useProjects';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useScheduleDocument } from '@/hooks/useScheduleDocument';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { errorMessage, isNotFoundError } from '@/lib/format';
import { NotFoundPage } from '@/pages/NotFoundPage';

function ScheduleEditorWorkspace({
  schedule,
  initialDocument,
  initialRevision,
}: {
  schedule: Schedule;
  initialDocument: ScheduleDocument;
  initialRevision: number;
}): ReactElement {
  const editor = useScheduleEditor({
    schedule,
    initialDocument,
    initialRevision,
  });

  const visibleRows = useMemo(
    () =>
      buildVisibleRows(
        editor.document,
        editor.summary,
        editor.rollups,
        editor.collapsedWbsIds,
      ),
    [editor.collapsedWbsIds, editor.document, editor.rollups, editor.summary],
  );

  return (
    <div className="flex h-[calc(100dvh-48px-36px)] min-h-[480px] flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
          {schedule.code !== null && schedule.code.trim() !== '' && (
            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs font-medium text-muted-foreground">
              {schedule.code}
            </span>
          )}
        </div>
      </div>
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
          />
        }
        right={
          <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
            Gantt timeline
          </div>
        }
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
