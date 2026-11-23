import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { Skeleton } from '@/components/ui/skeleton';
import {
  buildLibraryGroups,
  clearLibraryFilters,
  hasAnyLibraryFilters,
  readLibraryView,
} from '@/features/library/library-list';
import { LibraryToolbar } from '@/features/library/LibraryToolbar';
import { LibraryTree } from '@/features/library/LibraryTree';
import { useLibraryData } from '@/hooks/useLibrary';

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Cross-workspace Schedule Library page at `/library` (spec §7.1, R7, S6).
 */
export function LibraryPage(): ReactElement {
  const libraryQuery = useLibraryData();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readLibraryView(searchParams);

  const groups = useMemo(
    () => (libraryQuery.data ? buildLibraryGroups(libraryQuery.data, view) : null),
    [libraryQuery.data, view],
  );

  const subtitle =
    groups === null
      ? 'Schedules across your workspaces and shared projects'
      : `${pluralize(groups.totalSchedules, 'schedule', 'schedules')} across ${pluralize(groups.totalProjects, 'project', 'projects')}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className={PAGE_HEADING_CLASSES}>Library</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {libraryQuery.isError && libraryQuery.data === undefined ? (
        <SectionError
          error={libraryQuery.error}
          onRetry={() => void libraryQuery.refetch()}
          className="py-16"
        />
      ) : libraryQuery.data === undefined || groups === null ? (
        <div className="flex flex-col gap-4" aria-label="Loading library">
          <Skeleton className="h-9 w-full max-w-md" />
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
      ) : (
        <>
          <LibraryToolbar workspaces={libraryQuery.data.workspaces} />
          <LibraryTree
            groups={groups}
            hasActiveFilters={hasAnyLibraryFilters(view)}
            onClearFilters={() =>
              setSearchParams(clearLibraryFilters(searchParams), { replace: true })
            }
          />
        </>
      )}
    </div>
  );
}
