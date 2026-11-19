import type { ColumnDef } from '@tanstack/react-table';
import { ChartGantt, FileUp, Plus, StickyNote } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { TagBadges } from '@/components/common/TagBadges';
import { Button } from '@/components/ui/button';
import type { ProjectSummary, Schedule, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { canEdit } from '@/features/workspaces/roles';
import { useNow } from '@/hooks/useNow';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { relativeTime, shortDate } from '@/lib/format';

/** How much of the notes the Name cell's `title` shows (P3 core spec §6.3). */
const TITLE_NOTES_LENGTH = 200;

const NO_SCHEDULES: readonly Schedule[] = [];

// A read-only chip after an archived schedule's name; muted text on the muted fill.
const ARCHIVED_BADGE_CLASSES =
  'inline-flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground';

type RenderMenu = (schedule: Schedule, schedules: readonly Schedule[]) => ReactNode;

/** "—" for a missing value (spec §6.1). */
function orDash(value: string | null): string {
  return value === null || value.trim() === '' ? '—' : value;
}

/** The first `length` characters of `text`, counting code points, so no emoji is cut in half. */
function firstCharacters(text: string, length: number): string {
  return Array.from(text).slice(0, length).join('');
}

/** The Name cell's tooltip: the name, the code and the notes' first 200 characters, one per line. */
function nameTitle(schedule: Schedule): string {
  const notes =
    schedule.notes === null ? null : firstCharacters(schedule.notes.trim(), TITLE_NOTES_LENGTH);
  return [schedule.name, schedule.code, notes]
    .filter((line): line is string => line !== null && line.trim() !== '')
    .join('\n');
}

/** The notes' first line, or `null` without notes. */
function notesFirstLine(notes: string | null): string | null {
  const firstLine = notes?.trim().split(/\r?\n/, 1)[0]?.trim() ?? '';
  return firstLine === '' ? null : firstLine;
}

function sourceLabel(schedule: Schedule): string {
  if (schedule.source === 'blank') return 'Blank';
  return schedule.sourceFileName === null ? 'Imported' : `Imported · ${schedule.sourceFileName}`;
}

/**
 * The files table's columns (spec §6.3); Activities, Source and Notes hide below 1024 px, Code,
 * Update and Last modified below 768 px (§6.6). The last column holds the row menu that
 * `renderMenu` draws, under a visually hidden "Actions" header.
 */
function scheduleColumns(
  now: Date,
  schedules: readonly Schedule[],
  renderMenu: RenderMenu | undefined,
): ColumnDef<Schedule, unknown>[] {
  return [
    {
      id: 'name',
      header: 'Name',
      // The widest column: the others keep to their content.
      meta: { className: 'w-full' },
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <span title={nameTitle(row.original)} className="max-w-80 truncate font-medium">
            {row.original.name}
          </span>
          {row.original.archivedAt !== null && (
            <span className={ARCHIVED_BADGE_CLASSES}>Archived</span>
          )}
        </div>
      ),
    },
    {
      id: 'code',
      header: 'Code',
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => <span className="font-mono text-xs">{orDash(row.original.code)}</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      cell: ({ row }) =>
        row.original.isCurrent || row.original.baseline !== 'none' ? (
          <TagBadges schedule={row.original} />
        ) : (
          '—'
        ),
    },
    {
      id: 'statusDate',
      header: 'Status date',
      cell: ({ row }) => shortDate(row.original.statusDate),
    },
    {
      id: 'update',
      header: 'Update',
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) =>
        row.original.updateNumber === null ? '—' : `Update ${row.original.updateNumber}`,
    },
    {
      id: 'lastModified',
      header: 'Last modified',
      meta: { className: 'hidden md:table-cell' },
      cell: ({ row }) => relativeTime(row.original.updatedAt, now),
    },
    {
      id: 'activities',
      header: 'Activities',
      meta: { className: 'hidden tabular-nums lg:table-cell' },
      cell: ({ row }) => row.original.activityCount.toLocaleString('en-US'),
    },
    {
      id: 'source',
      header: 'Source',
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => {
        const label = sourceLabel(row.original);
        return (
          <span title={label} className="block max-w-60 truncate">
            {label}
          </span>
        );
      },
    },
    {
      id: 'notes',
      header: 'Notes',
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => {
        const firstLine = notesFirstLine(row.original.notes);
        return firstLine === null ? null : (
          <span className="flex max-w-60 items-center gap-1.5">
            <StickyNote className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{firstLine}</span>
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => renderMenu?.(row.original, schedules) ?? null,
    },
  ];
}

/** No schedules: editors get "New schedule" and "Import schedule", viewers a note (spec §6.3). */
function NoSchedules({
  project,
  editable,
}: {
  project: ProjectSummary;
  editable: boolean;
}): ReactElement {
  const { openDialog } = useDialogs();
  if (!editable) {
    return (
      <EmptyState
        icon={ChartGantt}
        title="No schedules yet"
        description="Schedules in this project will appear here."
      />
    );
  }
  return (
    <EmptyState
      icon={ChartGantt}
      title="No schedules yet"
      description="Create a blank schedule or import one from your planning tool."
      action={
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
      }
    />
  );
}

/**
 * The project's schedules in `listSchedules` order (spec §6.3), archived ones only with
 * `showArchived`; archived rows are muted, with an "Archived" badge after the name. Rows have no
 * link until the schedule editor exists (P4).
 */
export function SchedulesTable({
  project,
  workspace,
  showArchived,
  renderMenu,
}: {
  project: ProjectSummary;
  workspace: WorkspaceSummary;
  showArchived: boolean;
  renderMenu?: RenderMenu;
}): ReactElement {
  const now = useNow(60_000);
  const schedules = useProjectSchedules(project.id);
  const all = schedules.data ?? NO_SCHEDULES;
  const columns = useMemo(() => scheduleColumns(now, all, renderMenu), [now, all, renderMenu]);
  const rows = useMemo(
    () => (showArchived ? all : all.filter((schedule) => schedule.archivedAt === null)),
    [all, showArchived],
  );

  // A failed background refetch keeps the cached list on screen.
  let state: 'loading' | 'error' | 'ready' = 'ready';
  if (schedules.data === undefined) state = schedules.isError ? 'error' : 'loading';

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(schedule) => schedule.id}
      caption="Schedules"
      state={state}
      error={schedules.error}
      onRetry={() => void schedules.refetch()}
      empty={<NoSchedules project={project} editable={canEdit(workspace)} />}
      rowClassName={(schedule) =>
        schedule.archivedAt === null ? undefined : 'text-muted-foreground'
      }
    />
  );
}
