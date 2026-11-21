import { ChartGantt, FileUp, Plus } from 'lucide-react';
import type { ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { canEdit } from '@/features/workspaces/roles';
import { useProject } from '@/hooks/useProjects';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { isNotFoundError } from '@/lib/format';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Schedule editor route (`/w/:workspaceId/p/:projectId/schedule`). Resolves `?scheduleId=` or the
 * project's current schedule; expanded with full editor shell, grid, Gantt and inspector in Tasks 23–35.
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
        <Skeleton className="h-80 w-full" />
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h1 className={PAGE_HEADING_CLASSES}>{schedule.name}</h1>
        {schedule.code !== null && schedule.code.trim() !== '' && (
          <span className="rounded-sm bg-muted px-1.5 py-px font-mono text-2xs font-medium text-muted-foreground">
            {schedule.code}
          </span>
        )}
      </div>
    </div>
  );
}
