import type { ColumnDef } from '@tanstack/react-table';
import { ChartGantt, FileUp, Folder as FolderIcon, Lock, Plus, StickyNote } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { DataTable } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { TagBadges } from '@/components/common/TagBadges';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ID, ProjectSummary, Schedule, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { canEdit } from '@/features/workspaces/roles';
import { useNow } from '@/hooks/useNow';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { relativeTime, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

/** How much of the notes the Name cell's `title` shows (P3 core spec §6.3). */
const TITLE_NOTES_LENGTH = 200;

const NO_SCHEDULES: readonly Schedule[] = [];

// A read-only chip after an archived schedule's name; muted text on the muted fill.
const ARCHIVED_BADGE_CLASSES =
  'inline-flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground';

const FOLDER_BADGE_CLASSES =
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-muted/70 px-1.5 text-2xs font-medium whitespace-nowrap text-muted-foreground';

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

interface SelectionConfig {
  selectedIds: ReadonlySet<ID>;
  allSelected: boolean;
  someSelected: boolean;
  onToggleSelect(scheduleId: ID, checked: boolean): void;
  onToggleSelectAll(checked: boolean): void;
}

/**
 * The files table's columns (spec §6.3, P4 §7.1, P4 later §7.2.3); Activities, Source and Notes
 * hide below 1024 px, Code, Update and Last modified below 768 px (§6.6). When `selection` is
 * given (editors/owners), a leading checkbox column supports bulk actions.
 */
function scheduleColumns(
  now: Date,
  schedules: readonly Schedule[],
  workspaceId: string,
  projectId: string,
  renderMenu: RenderMenu | undefined,
  selection: SelectionConfig | undefined,
  folderNamesById: ReadonlyMap<ID, string> | undefined,
): ColumnDef<Schedule, unknown>[] {
  const selectColumn: ColumnDef<Schedule, unknown>[] = selection
    ? [
        {
          id: 'select',
          header: () => (
            <Checkbox
              aria-label="Select all schedules"
              checked={
                selection.allSelected ? true : selection.someSelected ? 'indeterminate' : false
              }
              onCheckedChange={(value) => selection.onToggleSelectAll(value === true)}
              className="bg-card"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              aria-label={`Select ${row.original.name}`}
              checked={selection.selectedIds.has(row.original.id)}
              onCheckedChange={(value) => selection.onToggleSelect(row.original.id, value === true)}
              className="bg-card"
            />
          ),
        },
      ]
    : [];

  return [
    ...selectColumn,
    {
      id: 'name',
      header: 'Name',
      // The widest column: the others keep to their content.
      meta: { className: 'w-full' },
      cell: ({ row }) => {
        const schedule = row.original;
        const href = `/w/${workspaceId}/p/${projectId}/schedule?scheduleId=${schedule.id}`;
        const lockLabel =
          schedule.lock === null ? null : `Being edited by ${schedule.lock.userName}`;
        const folderName =
          schedule.folderId !== null ? folderNamesById?.get(schedule.folderId) : undefined;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to={href}
              title={nameTitle(schedule)}
              className={cn(
                'max-w-80 truncate rounded-sm font-medium hover:underline',
                FOCUS_OUTLINE_CLASSES,
              )}
            >
              {schedule.name}
            </Link>
            {lockLabel !== null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    role="img"
                    aria-label={lockLabel}
                    className="inline-flex shrink-0 items-center text-warning-foreground"
                  >
                    <Lock className="size-3.5" aria-hidden="true" />
                  </span>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>{lockLabel}</TooltipContent>
              </Tooltip>
            )}
            {folderName !== undefined && (
              <span className={FOLDER_BADGE_CLASSES}>
                <FolderIcon className="size-3" aria-hidden="true" />
                <span className="max-w-28 truncate">{folderName}</span>
              </span>
            )}
            {schedule.archivedAt !== null && (
              <span className={ARCHIVED_BADGE_CLASSES}>Archived</span>
            )}
          </div>
        );
      },
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
 * The project's schedules table (spec §6.3, P4 §7.1, P4 later §7.2): supports optional
 * pre-filtered rows, multi-row checkbox selection for editors/owners, and folder pills.
 */
export function SchedulesTable({
  project,
  workspace,
  showArchived,
  schedulesOverride,
  folderNamesById,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  hasActiveFilter = false,
  onClearFilters,
  renderMenu,
}: {
  project: ProjectSummary;
  workspace: WorkspaceSummary;
  showArchived: boolean;
  schedulesOverride?: readonly Schedule[];
  folderNamesById?: ReadonlyMap<ID, string>;
  selectedIds?: ReadonlySet<ID>;
  onToggleSelect?(scheduleId: ID, checked: boolean): void;
  onToggleSelectAll?(checked: boolean): void;
  hasActiveFilter?: boolean;
  onClearFilters?(): void;
  renderMenu?: RenderMenu;
}): ReactElement {
  const now = useNow(60_000);
  const schedules = useProjectSchedules(project.id);
  const all = schedules.data ?? NO_SCHEDULES;
  const rows = useMemo(
    () =>
      schedulesOverride ??
      (showArchived ? all : all.filter((schedule) => schedule.archivedAt === null)),
    [all, schedulesOverride, showArchived],
  );

  const selection = useMemo<SelectionConfig | undefined>(() => {
    if (!canEdit(workspace) || !selectedIds || !onToggleSelect || !onToggleSelectAll) {
      return undefined;
    }
    const selectedCount = rows.filter((s) => selectedIds.has(s.id)).length;
    return {
      selectedIds,
      allSelected: rows.length > 0 && selectedCount === rows.length,
      someSelected: selectedCount > 0 && selectedCount < rows.length,
      onToggleSelect,
      onToggleSelectAll,
    };
  }, [workspace, selectedIds, onToggleSelect, onToggleSelectAll, rows]);

  const columns = useMemo(
    () =>
      scheduleColumns(
        now,
        all,
        workspace.id,
        project.id,
        renderMenu,
        selection,
        folderNamesById,
      ),
    [now, all, workspace.id, project.id, renderMenu, selection, folderNamesById],
  );

  // A failed background refetch keeps the cached list on screen.
  let state: 'loading' | 'error' | 'ready' = 'ready';
  if (schedules.data === undefined) state = schedules.isError ? 'error' : 'loading';

  const emptyState =
    hasActiveFilter && all.length > 0 ? (
      <EmptyState
        icon={ChartGantt}
        title="No matching schedules"
        description="Try another folder, search term or filter."
        action={
          onClearFilters ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClearFilters}
              className="border-input bg-card dark:bg-card"
            >
              Clear filters
            </Button>
          ) : undefined
        }
      />
    ) : (
      <NoSchedules project={project} editable={canEdit(workspace)} />
    );

  return (
    <DataTable
      columns={columns}
      data={rows}
      getRowId={(schedule) => schedule.id}
      caption="Schedules"
      state={state}
      error={schedules.error}
      onRetry={() => void schedules.refetch()}
      empty={emptyState}
      rowClassName={(schedule) =>
        schedule.archivedAt === null ? undefined : 'text-muted-foreground'
      }
    />
  );
}
