import { Share2 } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { SectionError } from '@/components/common/SectionError';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Skeleton } from '@/components/ui/skeleton';
import type { SharedScheduleRow } from '@/data/types';
import { useNow } from '@/hooks/useNow';
import { useSharedWithMe } from '@/hooks/useSharedWithMe';
import { fullName, initials, relativeTime, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// Width, visibility and padding of each column (spec §6.6, §6.9). With table-layout: fixed the
// header cells set the widths: 38 / 24 / 19 / 19 % at 768 px and up. "Shared by" is hidden below
// 768 px and "Status date" below 640 px; the columns left keep their proportions. The first cell
// has 20 px on the left, the last visible cell 28 px on the right, the others 6 px a side.
const COLUMN_CLASSES = {
  schedule: 'w-3/5 pr-1.5 pl-5 sm:w-1/2 md:w-[38%]',
  sharedBy: 'hidden w-[24%] px-1.5 md:table-cell',
  shared: 'w-2/5 pr-7 pl-1.5 sm:w-1/4 sm:pr-1.5 md:w-[19%]',
  statusDate: 'hidden w-1/4 pr-7 pl-1.5 sm:table-cell md:w-[19%]',
} as const;

const HEADER_CELL_CLASSES =
  'text-left text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase';

// All four columns. Below 768 px fewer columns show and the span covers them too, so the cell
// fills the row at every width.
const FULL_ROW_SPAN = 4;

// The schedule name stretches over the row through its ::after box, so the whole row is the link.
// Keyboard focus draws the 2 px outline on that box instead of the link text: inside the row and
// with the panel's radius, so the panel's rounded overflow clip never cuts it. The ::after sets
// its own outline style, apart from the link's outline-hidden.
const ROW_LINK_CLASSES =
  'block truncate text-sm font-medium outline-hidden after:absolute after:inset-0 after:rounded-lg focus-visible:after:outline-solid focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring';

/** The sharer's photo, or their initials on a 20 px circle. */
function SharerAvatar({ person }: { person: SharedScheduleRow['sharedBy'] }): ReactElement {
  if (person.avatarUrl) {
    return (
      <img src={person.avatarUrl} alt="" className="size-5 shrink-0 rounded-full object-cover" />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs leading-none font-medium text-muted-foreground"
    >
      {initials(person)}
    </span>
  );
}

function SharedRow({ row, now }: { row: SharedScheduleRow; now: Date }): ReactElement {
  const sharer = fullName(row.sharedBy);
  return (
    <tr className="relative h-14 border-b transition-colors duration-150 ease-standard last:border-b-0 hover:bg-accent/40">
      <td className={COLUMN_CLASSES.schedule}>
        <Link
          to={`/w/${row.workspaceId}/p/${row.projectId}/schedule?scheduleId=${row.scheduleId}`}
          // The link covers the whole row, so a title on any other cell never shows (D14).
          title={`${row.scheduleName}\n${row.projectName}\nShared by ${sharer}`}
          className={ROW_LINK_CLASSES}
        >
          {row.scheduleName}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">{row.projectName}</span>
      </td>
      <td className={COLUMN_CLASSES.sharedBy}>
        <span className="flex min-w-0 items-center gap-2">
          <SharerAvatar person={row.sharedBy} />
          <span className="truncate text-sm">{sharer}</span>
        </span>
      </td>
      <td className={cn(COLUMN_CLASSES.shared, 'truncate text-sm text-muted-foreground')}>
        {relativeTime(row.sharedAt, now)}
      </td>
      <td className={cn(COLUMN_CLASSES.statusDate, 'truncate text-sm')}>
        {shortDate(row.statusDate)}
      </td>
    </tr>
  );
}

/** A row-sized placeholder with the same columns as the final rows. */
function SkeletonRow(): ReactElement {
  return (
    <tr
      data-testid="shared-row-skeleton"
      aria-hidden="true"
      className="h-14 border-b last:border-b-0"
    >
      <td className={COLUMN_CLASSES.schedule}>
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-3/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      </td>
      <td className={COLUMN_CLASSES.sharedBy}>
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
      </td>
      <td className={COLUMN_CLASSES.shared}>
        <Skeleton className="h-3.5 w-3/4" />
      </td>
      <td className={COLUMN_CLASSES.statusDate}>
        <Skeleton className="h-3.5 w-3/4" />
      </td>
    </tr>
  );
}

/** One cell across the whole table, for the empty and the error state (spec §6.6). */
function FullRow({ children }: { children: ReactNode }): ReactElement {
  return (
    <tr>
      <td colSpan={FULL_ROW_SPAN} className="h-[210px] px-5 py-6">
        {children}
      </td>
    </tr>
  );
}

function Body(): ReactElement {
  const shared = useSharedWithMe();
  const now = useNow(60_000);

  // A failed background refetch keeps the cached rows on screen.
  if (shared.data === undefined) {
    if (!shared.isError) {
      return (
        <>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </>
      );
    }
    return (
      <FullRow>
        <SectionError error={shared.error} onRetry={() => void shared.refetch()} />
      </FullRow>
    );
  }
  if (shared.data.length === 0) {
    return (
      <FullRow>
        <EmptyState
          icon={Share2}
          title="Nothing shared yet"
          description="Schedules that others share with you will appear here."
          action={
            <Link
              to="/help/sharing"
              className={cn(
                'rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline',
                FOCUS_OUTLINE_CLASSES,
              )}
            >
              How sharing works
            </Link>
          }
        />
      </FullRow>
    );
  }
  return (
    <>
      {shared.data.map((row) => (
        <SharedRow key={row.shareId} row={row} now={now} />
      ))}
    </>
  );
}

/** Schedules other people shared with the user, newest first (spec §6.6). */
export function SharedSchedulesTable(): ReactElement {
  return (
    <section aria-labelledby="shared-heading" className="flex flex-col gap-4">
      <h2 id="shared-heading" className="text-lg font-bold tracking-[-0.01em]">
        Shared with me
      </h2>
      <div className="overflow-hidden rounded-lg bg-card ring-1 ring-edge">
        <table aria-labelledby="shared-heading" className="w-full table-fixed">
          <thead>
            <tr className="h-10 border-b bg-muted/50">
              <th scope="col" className={cn(HEADER_CELL_CLASSES, COLUMN_CLASSES.schedule)}>
                Schedule
              </th>
              <th scope="col" className={cn(HEADER_CELL_CLASSES, COLUMN_CLASSES.sharedBy)}>
                Shared by
              </th>
              <th scope="col" className={cn(HEADER_CELL_CLASSES, COLUMN_CLASSES.shared)}>
                Shared
              </th>
              <th scope="col" className={cn(HEADER_CELL_CLASSES, COLUMN_CLASSES.statusDate)}>
                Status date
              </th>
            </tr>
          </thead>
          <tbody>
            <Body />
          </tbody>
        </table>
      </div>
    </section>
  );
}
