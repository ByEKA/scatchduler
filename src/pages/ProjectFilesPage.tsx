import { FileUp, Info, Pencil, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ID, ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { BulkSchedulesBar } from '@/features/files/BulkSchedulesBar';
import {
  filterAndSortSchedules,
  hasActiveFilesFilters,
  readFilesView,
  withFilesViewParams,
  type FilesView,
} from '@/features/files/files-list';
import { FilesToolbar } from '@/features/files/FilesToolbar';
import { FolderSidebar } from '@/features/files/FolderSidebar';
import { ScheduleMenu } from '@/features/files/ScheduleMenu';
import { SchedulesTable } from '@/features/files/SchedulesTable';
import { canEdit, VIEWER_HINT } from '@/features/workspaces/roles';
import { useProjectFolders } from '@/hooks/useFolders';
import { useProject } from '@/hooks/useProjects';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { coverFor } from '@/lib/cover';
import { isNotFoundError, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFoundPage';

// The cover thumbnail: 96 × 64 (spec §6.3).
const THUMBNAIL_CLASSES = 'h-16 w-24 shrink-0 overflow-hidden rounded-md';

// The outline buttons sit on the page background, so they get the card fill (as on Projects).
const OUTLINE_BUTTON_CLASSES = 'border-input bg-card dark:bg-card';

const COUNTER_LABEL_CLASSES =
  'text-2xs font-medium tracking-[0.04em] text-muted-foreground uppercase';

/** The project photo, or the generated cover when there is none or it fails to load. */
function CoverThumbnail({ project }: { project: ProjectSummary }): ReactElement {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const photoUrl = project.coverImageUrl !== brokenUrl ? project.coverImageUrl : null;
  if (photoUrl === null) {
    return <div aria-hidden="true" style={coverFor(project.id)} className={THUMBNAIL_CLASSES} />;
  }
  return (
    <img
      src={photoUrl}
      alt=""
      width={96}
      height={64}
      className={cn(THUMBNAIL_CLASSES, 'object-cover')}
      onError={() => setBrokenUrl(photoUrl)}
    />
  );
}

/**
 * A button that, with a `hint`, stays focusable but does nothing and says why in a Tooltip
 * (spec §6.1). It always sits inside the Tooltip trigger, so it never remounts when the hint
 * arrives after the first render.
 */
function HintedButton({
  hint,
  variant = 'default',
  size = 'sm',
  onClick,
  children,
}: {
  hint: string | null;
  variant?: 'default' | 'outline';
  size?: 'sm' | 'xs';
  onClick?: () => void;
  children: ReactNode;
}): ReactElement {
  const disabled = hint !== null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-disabled={disabled ? 'true' : undefined}
          onClick={() => {
            if (disabled) return;
            onClick?.();
          }}
          className={cn(
            variant === 'outline' && OUTLINE_BUTTON_CLASSES,
            disabled && 'cursor-not-allowed opacity-60',
            disabled &&
              (variant === 'outline'
                ? 'hover:bg-card hover:text-foreground dark:hover:bg-card'
                : 'hover:bg-primary'),
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      {disabled && <TooltipContent sideOffset={6}>{hint}</TooltipContent>}
    </Tooltip>
  );
}

/** The heading row while the project loads: the h1 holds a skeleton and hidden text. */
function LoadingHeader(): ReactElement {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Skeleton aria-hidden="true" className={THUMBNAIL_CLASSES} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className={PAGE_HEADING_CLASSES}>
          <span className="sr-only">Loading project…</span>
          <span
            aria-hidden="true"
            className="block h-5 w-64 max-w-full animate-pulse rounded-md bg-accent"
          />
        </h1>
        <Skeleton aria-hidden="true" className="h-4 w-40 max-w-full" />
      </div>
    </div>
  );
}

/**
 * Cover, name, code, status and "{client} · {city}", with "Edit project" ("Project details" for
 * viewers), "Import schedule" and "+ New schedule" (spec §6.3).
 */
function ProjectHeader({
  project,
  workspace,
}: {
  project: ProjectSummary;
  workspace: WorkspaceSummary;
}): ReactElement {
  const { openDialog } = useDialogs();
  const editable = canEdit(workspace);
  const writeHint = editable ? null : VIEWER_HINT;
  const subtitle = [project.client.name, project.location.city]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .join(' · ');
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <CoverThumbnail project={project} />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* tabIndex -1: a dialog focuses the heading when the element that opened it has left
                the page. */}
            <h1
              tabIndex={-1}
              className={cn(
                'min-w-0 rounded-sm wrap-anywhere',
                PAGE_HEADING_CLASSES,
                FOCUS_OUTLINE_CLASSES,
              )}
            >
              {project.name}
            </h1>
            <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs font-medium text-muted-foreground">
              {project.code}
            </span>
            <StatusBadge status={project.attributes.status} />
          </div>
          {subtitle !== '' && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            openDialog('editProject', { workspaceId: project.workspaceId, projectId: project.id })
          }
          className={OUTLINE_BUTTON_CLASSES}
        >
          {editable ? <Pencil aria-hidden="true" /> : <Info aria-hidden="true" />}
          {editable ? 'Edit project' : 'Project details'}
        </Button>
        <HintedButton
          hint={writeHint}
          variant="outline"
          onClick={() => openDialog('importSchedule', { projectId: project.id })}
        >
          <FileUp aria-hidden="true" />
          Import schedule
        </HintedButton>
        <HintedButton
          hint={writeHint}
          onClick={() => openDialog('newSchedule', { projectId: project.id })}
        >
          <Plus aria-hidden="true" />
          New schedule
        </HintedButton>
      </div>
    </div>
  );
}

/** One counter: its label in a `<dt>`, its value in the `<dd>` after it. */
function Counter({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className={COUNTER_LABEL_CLASSES}>{label}</dt>
      <dd className="flex min-h-6 min-w-0 items-center gap-2 text-sm font-medium">{children}</dd>
    </div>
  );
}

/**
 * "Status date", "Schedules" (not archived) and "Current schedule", with "Open current schedule"
 * linking directly to the schedule editor (spec §6.3, P4 §7.1).
 */
function ProjectCounters({ project }: { project: ProjectSummary }): ReactElement {
  const current = project.currentSchedule;
  return (
    <section aria-label="Project summary" className="rounded-lg bg-card px-5 py-3 ring-1 ring-edge">
      <dl className="flex flex-wrap gap-x-10 gap-y-3">
        <Counter label="Status date">{shortDate(project.statusDate)}</Counter>
        <Counter label="Schedules">
          <span className="tabular-nums">{project.scheduleCount}</span>
        </Counter>
        <Counter label="Current schedule">
          <span className="min-w-0 truncate" title={current?.name}>
            {current?.name ?? 'None'}
          </span>
          {current !== null && (
            <Button asChild variant="outline" size="xs" className={OUTLINE_BUTTON_CLASSES}>
              <Link
                to={`/w/${project.workspaceId}/p/${project.id}/schedule?scheduleId=${current.id}`}
              >
                Open current schedule
              </Link>
            </Button>
          )}
        </Counter>
      </dl>
    </section>
  );
}

/**
 * A project's files (spec §6.3, P4 later §7.2): header, counters, hierarchical folder sidebar,
 * search/tag/sort toolbar, bulk action bar, and schedules table.
 */
export function ProjectFilesPage(): ReactElement {
  const { workspaceId, projectId } = useParams();
  const workspaces = useWorkspaces();
  const projectQuery = useProject(workspaceId, projectId);
  const schedulesQuery = useProjectSchedules(projectId);
  const foldersQuery = useProjectFolders(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<ID>>(() => new Set());

  const view = useMemo(() => readFilesView(searchParams), [searchParams]);
  const allSchedules = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data]);
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const folderNamesById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.name])),
    [folders],
  );

  // Schedules shown in folder counts respect the "Show archived" setting.
  const schedulesForFolderCounts = useMemo(
    () => (view.archived ? allSchedules : allSchedules.filter((s) => s.archivedAt === null)),
    [allSchedules, view.archived],
  );
  const visibleSchedules = useMemo(
    () => filterAndSortSchedules(allSchedules, view),
    [allSchedules, view],
  );

  const selectedSchedules = useMemo(
    () => visibleSchedules.filter((s) => selectedIds.has(s.id)),
    [visibleSchedules, selectedIds],
  );

  const updateView = useCallback(
    (patch: Partial<FilesView>) => {
      setSearchParams((prev) => withFilesViewParams(prev, patch), { replace: true });
    },
    [setSearchParams],
  );

  const clearFilters = useCallback(() => {
    updateView({ folder: 'all', q: '', tag: 'all', sort: 'default' });
  }, [updateView]);

  const handleToggleSelect = useCallback((scheduleId: ID, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(scheduleId);
      else next.delete(scheduleId);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedIds(new Set());
        return;
      }
      setSelectedIds(new Set(visibleSchedules.map((s) => s.id)));
    },
    [visibleSchedules],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  if (workspaceId === undefined || projectId === undefined) return <NotFoundPage />;
  const project = projectQuery.data;
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  if (isNotFoundError(projectQuery.error)) return <NotFoundPage />;
  if (project !== undefined && project.workspaceId !== workspaceId) return <NotFoundPage />;
  // Not one of my workspaces, once the list of mine has loaded.
  if (workspaces.data !== undefined && workspace === undefined) return <NotFoundPage />;

  // A failed background refetch keeps the cached project on screen.
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
  if (project === undefined || workspace === undefined) return <LoadingHeader />;

  const editable = canEdit(workspace);

  return (
    <div className="flex flex-col gap-4">
      <ProjectHeader project={project} workspace={workspace} />
      <ProjectCounters project={project} />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <FolderSidebar
          projectId={project.id}
          workspace={workspace}
          schedules={schedulesForFolderCounts}
          selectedFolder={view.folder}
          onSelectFolder={(folder) => {
            clearSelection();
            updateView({ folder });
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <FilesToolbar
            view={view}
            onUpdateView={updateView}
            onClearFilters={clearFilters}
          />
          {editable && (
            <BulkSchedulesBar
              selectedSchedules={selectedSchedules}
              allProjectSchedules={allSchedules}
              folders={folders}
              workspace={workspace}
              onClearSelection={clearSelection}
            />
          )}
          <SchedulesTable
            project={project}
            workspace={workspace}
            showArchived={view.archived}
            schedulesOverride={visibleSchedules}
            folderNamesById={view.folder === 'all' ? folderNamesById : undefined}
            selectedIds={editable ? selectedIds : undefined}
            onToggleSelect={editable ? handleToggleSelect : undefined}
            onToggleSelectAll={editable ? handleToggleSelectAll : undefined}
            hasActiveFilter={hasActiveFilesFilters(view)}
            onClearFilters={clearFilters}
            renderMenu={(schedule, schedules) => (
              <ScheduleMenu
                schedule={schedule}
                schedules={schedules}
                project={project}
                workspace={workspace}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
