import { Calendar, ChevronRight, Clock } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProjectSummary } from '@/data/types';
import { useNow } from '@/hooks/useNow';
import { coverFor } from '@/lib/cover';
import { pluralize, relativeTime, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec §6.6: 260 tall, 1 px ring that strengthens on hover. Keyboard focus on the name link draws
// the 2 px focus ring around the whole card; the schedules link has its own outline instead.
const CARD_CLASSES =
  'relative flex h-[260px] flex-col overflow-hidden rounded-lg bg-card ring-1 ring-edge';

// The cover zoom is a scale, so it stays off under reduced motion (spec §6.11).
const COVER_CLASSES =
  'size-full motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-standard motion-safe:group-hover:scale-[1.03]';

/** The project photo, or the generated cover when there is none or it fails to load (§6.10). */
function Cover({ project }: { project: ProjectSummary }): ReactElement {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const photoUrl = project.coverImageUrl !== brokenUrl ? project.coverImageUrl : null;
  return (
    <div className="h-[126px] shrink-0 overflow-hidden">
      {photoUrl !== null ? (
        <img
          data-testid="project-cover"
          data-cover="photo"
          src={photoUrl}
          alt=""
          className={cn(COVER_CLASSES, 'object-cover')}
          onError={() => setBrokenUrl(photoUrl)}
        />
      ) : (
        <div
          data-testid="project-cover"
          data-cover="generated"
          aria-hidden="true"
          style={coverFor(project.id)}
          className={COVER_CLASSES}
        />
      )}
    </div>
  );
}

/**
 * A recent project (spec §6.6): the name links to the project's files and stretches over the
 * whole card; the schedules link sits above that stretched area.
 */
export function ProjectCard({ project }: { project: ProjectSummary }): ReactElement {
  const now = useNow(60_000);
  const base = `/w/${project.workspaceId}/p/${project.id}`;

  return (
    <article
      className={cn(
        CARD_CLASSES,
        'group transition-shadow duration-150 ease-standard hover:ring-edge-strong has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-ring',
      )}
    >
      <Cover project={project} />
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            to={`${base}/files`}
            title={project.name}
            data-card-link=""
            className="min-w-0 truncate text-md font-semibold outline-hidden after:absolute after:inset-0"
          >
            {project.name}
          </Link>
          <span className="shrink-0 font-mono text-2xs font-medium text-muted-foreground">
            {project.code}
          </span>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
          {`Status date ${shortDate(project.statusDate)}`}
        </p>
      </div>
      <div className="flex h-[38px] shrink-0 items-center justify-between gap-2 border-t px-3.5 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{relativeTime(project.updatedAt, now)}</span>
        </span>
        <Link
          to={`${base}/schedule`}
          className={cn(
            'relative z-10 flex shrink-0 items-center gap-0.5 rounded-sm font-semibold text-link underline-offset-2 hover:underline',
            FOCUS_OUTLINE_CLASSES,
          )}
        >
          {pluralize(project.scheduleCount, 'schedule')}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

/** A card-sized placeholder; a plain `<div>`, so tests that count `article`s skip it. */
export function ProjectCardSkeleton(): ReactElement {
  return (
    <div data-testid="project-card-skeleton" aria-hidden="true" className={CARD_CLASSES}>
      <Skeleton className="h-[126px] shrink-0 rounded-none" />
      <div className="flex flex-1 flex-col gap-2.5 px-3 pt-4">
        <Skeleton className="h-5 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <div className="flex h-[38px] shrink-0 items-center justify-between border-t px-3.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-16" />
      </div>
    </div>
  );
}
