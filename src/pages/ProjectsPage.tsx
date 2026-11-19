import type { ColumnDef } from '@tanstack/react-table';
import { FolderKanban, Plus, SearchX, UserCog } from 'lucide-react';
import { useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { DataTable, type DataTableRowLink } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { ProjectCard, ProjectCardSkeleton } from '@/features/home/ProjectCard';
import { ProjectMenu } from '@/features/projects/ProjectMenu';
import { ProjectsToolbar } from '@/features/projects/ProjectsToolbar';
import {
  filterProjects,
  readProjectsView,
  sortProjects,
  withoutFilters,
} from '@/features/projects/project-list';
import { canEdit } from '@/features/workspaces/roles';
import { useWorkspaceProjects } from '@/hooks/useProjects';
import { useProjectsLayout } from '@/hooks/useProjectsLayout';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { pluralize, shortDate } from '@/lib/format';
import { optionLabel, PROJECT_TYPE_OPTIONS, STAGE_OPTIONS } from '@/lib/project-options';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFoundPage';

const VIEWER_HINT = "Viewers can't make changes in this workspace";

const TILE_GRID_CLASSES = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

const TILE_SKELETON_COUNT = 4;

const LINK_BUTTON_CLASSES = cn(
  'rounded-sm text-sm font-semibold text-link underline-offset-2 hover:underline',
  FOCUS_OUTLINE_CLASSES,
);

/** "—" for a missing value (P3 core spec §6.1). */
function orDash(value: string | null): string {
  return value === null || value.trim() === '' ? '—' : value;
}

/** The row link to the files page: the name, and a title of the name, code, client and city. */
function projectRowLink(project: ProjectSummary): DataTableRowLink {
  const lines = [project.name, project.code, project.client.name, project.location.city];
  return {
    to: `/w/${project.workspaceId}/p/${project.id}/files`,
    label: project.name,
    title: lines.filter((line): line is string => line !== null && line.trim() !== '').join('\n'),
  };
}

/**
 * The List columns (spec §6.2); Stage and Client hide below 1024 px, Type and City below 640. Rows
 * show only once the workspace is known; before that the columns serve the loading and error rows.
 */
function projectColumns(
  workspace: WorkspaceSummary | undefined,
): ColumnDef<ProjectSummary, unknown>[] {
  return [
    {
      id: 'project',
      header: 'Project',
      // The widest column: the others keep to their content.
      meta: { link: true, className: 'w-full' },
      cell: ({ row }) => (
        <span className="mt-0.5 inline-flex rounded-sm bg-muted px-1.5 font-mono text-2xs font-medium text-muted-foreground">
          {row.original.code}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.attributes.status} />,
    },
    {
      id: 'stage',
      header: 'Stage',
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => optionLabel(STAGE_OPTIONS, row.original.attributes.stage),
    },
    {
      id: 'type',
      header: 'Type',
      meta: { className: 'hidden sm:table-cell' },
      cell: ({ row }) => optionLabel(PROJECT_TYPE_OPTIONS, row.original.attributes.projectType),
    },
    {
      id: 'client',
      header: 'Client',
      meta: { className: 'hidden lg:table-cell' },
      cell: ({ row }) => orDash(row.original.client.name),
    },
    {
      id: 'city',
      header: 'City',
      meta: { className: 'hidden sm:table-cell' },
      cell: ({ row }) => orDash(row.original.location.city),
    },
    {
      id: 'statusDate',
      header: 'Status date',
      cell: ({ row }) => shortDate(row.original.statusDate),
    },
    {
      id: 'schedules',
      header: 'Schedules',
      meta: { className: 'tabular-nums' },
      cell: ({ row }) => row.original.scheduleCount,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) =>
        workspace === undefined ? null : (
          <ProjectMenu project={row.original} workspace={workspace} />
        ),
    },
  ];
}

/** "+ New project"; for viewers it stays focusable, does nothing and says why (P2 spec §5.9). */
function NewProjectButton({ disabled }: { disabled: boolean }): ReactElement {
  const { openDialog } = useDialogs();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          aria-disabled={disabled ? 'true' : undefined}
          onClick={() => {
            if (disabled) return;
            openDialog('newProject');
          }}
          className={cn(disabled && 'cursor-not-allowed opacity-60 hover:bg-primary')}
        >
          <Plus aria-hidden="true" />
          New project
        </Button>
      </TooltipTrigger>
      {disabled && <TooltipContent sideOffset={6}>{VIEWER_HINT}</TooltipContent>}
    </Tooltip>
  );
}

/** "Members" (team workspaces only) and "+ New project". */
function HeaderActions({ workspace }: { workspace: WorkspaceSummary }): ReactElement {
  const { openDialog } = useDialogs();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {workspace.kind === 'team' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openDialog('workspaceMembers', { workspaceId: workspace.id })}
          className="border-input bg-card dark:bg-card"
        >
          <UserCog aria-hidden="true" />
          Members
        </Button>
      )}
      <NewProjectButton disabled={!canEdit(workspace)} />
    </div>
  );
}

/** "{workspace} · {n} projects · {m} schedules"; {m} sums the schedules that aren't archived. */
function Summary({
  workspace,
  projects,
  loading,
}: {
  workspace: WorkspaceSummary | undefined;
  projects: readonly ProjectSummary[] | undefined;
  loading: boolean;
}): ReactElement | null {
  if (workspace === undefined || projects === undefined) {
    return loading ? <Skeleton aria-hidden="true" className="h-4 w-56 max-w-full" /> : null;
  }
  const schedules = projects.reduce((sum, project) => sum + project.scheduleCount, 0);
  return (
    <p className="text-sm text-muted-foreground">
      {`${workspace.name} · ${pluralize(projects.length, 'project')} · ${pluralize(schedules, 'schedule')}`}
    </p>
  );
}

/** The workspace has no projects: editors get "New project", viewers a note (spec §6.2). */
function NoProjects({ editable }: { editable: boolean }): ReactElement {
  const { openDialog } = useDialogs();
  if (!editable) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        description="Projects in this workspace will appear here."
      />
    );
  }
  return (
    <EmptyState
      icon={FolderKanban}
      title="No projects yet"
      description="Create a project to organize its schedules."
      action={
        <Button type="button" size="sm" onClick={() => openDialog('newProject')}>
          <Plus aria-hidden="true" />
          New project
        </Button>
      }
    />
  );
}

/** Search and filters leave nothing; "Clear filters" drops both and keeps the sort. */
function NoMatch({ onClear }: { onClear: () => void }): ReactElement {
  return (
    <EmptyState
      icon={SearchX}
      title="No matching projects"
      description="Try other words or clear the filters."
      action={
        <button type="button" onClick={onClear} className={LINK_BUTTON_CLASSES}>
          Clear filters
        </button>
      }
    />
  );
}

type ContentState =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown; retry: () => void }
  | { kind: 'ready'; workspace: WorkspaceSummary; projects: ProjectSummary[]; empty: ReactNode };

/** The projects as cards, with the project menu on each (spec §6.2 Tiles). */
function Tiles({ state }: { state: ContentState }): ReactElement {
  if (state.kind === 'loading') {
    return (
      <div className={TILE_GRID_CLASSES}>
        {Array.from({ length: TILE_SKELETON_COUNT }, (_, index) => (
          <ProjectCardSkeleton key={index} />
        ))}
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <SectionError
        error={state.error}
        onRetry={state.retry}
        className="min-h-[260px] rounded-lg bg-card ring-1 ring-edge"
      />
    );
  }
  if (state.projects.length === 0) return <div className="py-12">{state.empty}</div>;
  return (
    <div className={TILE_GRID_CLASSES}>
      {state.projects.map((project) => (
        <ProjectCard
          key={project.id}
          project={project}
          actions={<ProjectMenu project={project} workspace={state.workspace} />}
        />
      ))}
    </div>
  );
}

/** The projects as table rows (spec §6.2 List). */
function List({ state }: { state: ContentState }): ReactElement {
  const workspace = state.kind === 'ready' ? state.workspace : undefined;
  const columns = useMemo(() => projectColumns(workspace), [workspace]);
  return (
    <DataTable
      columns={columns}
      data={state.kind === 'ready' ? state.projects : NO_PROJECTS}
      getRowId={(project) => project.id}
      caption="Projects"
      state={state.kind}
      error={state.kind === 'error' ? state.error : undefined}
      onRetry={state.kind === 'error' ? state.retry : undefined}
      empty={state.kind === 'ready' ? state.empty : null}
      rowLink={projectRowLink}
    />
  );
}

const NO_PROJECTS: readonly ProjectSummary[] = [];

/** The workspace's projects, filtered and sorted as the URL asks (spec §6.2). */
export function ProjectsPage(): ReactElement {
  const { workspaceId } = useParams();
  const workspaces = useWorkspaces();
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  // Only a workspace of mine has projects to list, so an unknown id never asks for them.
  const projects = useWorkspaceProjects(workspace?.id);
  const [layout, setLayout] = useProjectsLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const { q, status, stage, sort } = readProjectsView(searchParams);

  const visible = useMemo(
    () =>
      projects.data === undefined
        ? undefined
        : sortProjects(filterProjects(projects.data, { q, status, stage, sort }), sort),
    [projects.data, q, status, stage, sort],
  );

  // An unknown workspace, or one that isn't mine, once the list of mine has loaded.
  if (workspaces.data !== undefined && workspace === undefined) return <NotFoundPage />;

  function clearFilters(): void {
    setSearchParams(withoutFilters(searchParams), { replace: true });
  }

  // A failed background refetch keeps the cached lists on screen.
  let state: ContentState;
  if (workspaces.data === undefined) {
    state = workspaces.isError
      ? { kind: 'error', error: workspaces.error, retry: () => void workspaces.refetch() }
      : { kind: 'loading' };
  } else if (workspace === undefined || projects.data === undefined || visible === undefined) {
    state = projects.isError
      ? { kind: 'error', error: projects.error, retry: () => void projects.refetch() }
      : { kind: 'loading' };
  } else {
    const empty =
      projects.data.length === 0 ? (
        <NoProjects editable={canEdit(workspace)} />
      ) : (
        <NoMatch onClear={clearFilters} />
      );
    state = { kind: 'ready', workspace, projects: visible, empty };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {/* tabIndex -1: "Delete project" focuses the heading when the deleted project's card or
              row, which held the menu that opened it, has left the page. */}
          <h1
            tabIndex={-1}
            className={cn('self-start rounded-sm', PAGE_HEADING_CLASSES, FOCUS_OUTLINE_CLASSES)}
          >
            Projects
          </h1>
          <Summary
            workspace={workspace}
            projects={projects.data}
            loading={state.kind === 'loading'}
          />
        </div>
        {workspace !== undefined && <HeaderActions workspace={workspace} />}
      </div>
      <ProjectsToolbar layout={layout} onLayoutChange={setLayout} />
      {layout === 'list' ? <List state={state} /> : <Tiles state={state} />}
    </div>
  );
}
