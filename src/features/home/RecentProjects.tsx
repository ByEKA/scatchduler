import type { ReactElement } from 'react';
import { SectionError } from '@/components/common/SectionError';
import { CreateProjectCard } from '@/features/home/CreateProjectCard';
import { ProjectCard, ProjectCardSkeleton } from '@/features/home/ProjectCard';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useRecentProjects } from '@/hooks/useProjects';

const ERROR_CLASSES = 'col-span-full h-[260px]';

function Skeletons(): ReactElement {
  return (
    <>
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
    </>
  );
}

function Content(): ReactElement {
  const context = useCurrentContext();
  const recent = useRecentProjects(context.workspace?.id);

  // When the workspaces or the project list never loaded, Retry refetches those (spec §6.10).
  // The recent query starts with the project list and fails in the same outage; refetch it too,
  // or the section would show a second error once the context recovers.
  if (context.status === 'error') {
    const retry = (): void => {
      context.retry();
      if (recent.isError) void recent.refetch();
    };
    return <SectionError error={context.error} onRetry={retry} className={ERROR_CLASSES} />;
  }
  if (context.status === 'loading') return <Skeletons />;
  // A failed background refetch keeps the cached cards on screen.
  if (recent.data === undefined) {
    if (!recent.isError) return <Skeletons />;
    return (
      <SectionError
        error={recent.error}
        onRetry={() => void recent.refetch()}
        className={ERROR_CLASSES}
      />
    );
  }
  return (
    <>
      {recent.data.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
      <CreateProjectCard />
    </>
  );
}

/** Up to five of the current workspace's latest projects and the create card (spec §6.6). */
export function RecentProjects(): ReactElement {
  return (
    <section aria-labelledby="recent-heading" className="flex flex-col gap-4">
      <h2 id="recent-heading" className="text-lg font-bold tracking-[-0.01em]">
        Recent projects
      </h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Content />
      </div>
    </section>
  );
}
