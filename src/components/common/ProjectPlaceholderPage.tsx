import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import { LaterPhaseNotice, PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkspaceProjects } from '@/hooks/useProjects';
import { isNotFoundError } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * A project section that a later phase fills in (spec §4.4, §6.6). The project comes from the
 * URL. An unknown project shows the Not found content; a failed read shows Retry instead, so a
 * network error never reads as "Page not found".
 */
export function ProjectPlaceholderPage({
  section,
}: {
  section: 'Files' | 'Dashboard' | 'Schedule';
}): ReactElement {
  const { workspaceId, projectId } = useParams();
  const { data: projects, error, isPending, refetch } = useWorkspaceProjects(workspaceId);

  if (workspaceId === undefined || projectId === undefined) return <NotFoundPage />;

  if (projects === undefined) {
    // Sized like the heading row below (20 px line), so the page doesn't shift when it loads.
    if (isPending) {
      return <Skeleton data-testid="project-heading-skeleton" className="h-5 w-64 max-w-full" />;
    }
    if (isNotFoundError(error)) return <NotFoundPage />;
    return <SectionError error={error} onRetry={() => void refetch()} className="py-16" />;
  }

  const project = projects.find((p) => p.id === projectId);
  if (project === undefined) return <NotFoundPage />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className={cn('min-w-0 wrap-anywhere', PAGE_HEADING_CLASSES)}>
          {`${project.name} · ${section}`}
        </h1>
        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs font-medium text-muted-foreground">
          {project.code}
        </span>
      </div>
      <LaterPhaseNotice />
    </div>
  );
}
