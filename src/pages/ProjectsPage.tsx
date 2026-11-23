import type { ColumnDef } from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  UserCog,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { DataTable, type DataTableRowLink } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PAGE_HEADING_CLASSES } from '@/components/common/PlaceholderPage';
import { SectionError } from '@/components/common/SectionError';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FOCUS_OUTLINE_CLASSES, MENU_ITEM_FOCUS_CLASSES } from '@/components/layout/top-bar-parts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ID, Program, ProjectSummary, WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { ProjectCard, ProjectCardSkeleton } from '@/features/home/ProjectCard';
import { ProgramDialog, type ProgramDialogTarget } from '@/features/projects/ProgramDialog';
import { ProjectMenu } from '@/features/projects/ProjectMenu';
import { ProjectsToolbar } from '@/features/projects/ProjectsToolbar';
import {
  filterProjects,
  readProjectsView,
  sortProjects,
  withoutFilters,
} from '@/features/projects/project-list';
import { canEdit, isOwner, VIEWER_HINT } from '@/features/workspaces/roles';
import { useDeleteProgram, useWorkspacePrograms } from '@/hooks/usePrograms';
import { useWorkspaceProjects } from '@/hooks/useProjects';
import { useProjectsLayout, type ProjectsLayout } from '@/hooks/useProjectsLayout';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { errorMessage, pluralize, shortDate } from '@/lib/format';
import { optionLabel, PROJECT_TYPE_OPTIONS, STAGE_OPTIONS } from '@/lib/project-options';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFoundPage';

const TILE_GRID_CLASSES = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
const MENU_ITEM_CLASSES = cn('h-8 py-0', MENU_ITEM_FOCUS_CLASSES);
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

/** "Members" (team workspaces only), "+ New program" (editors/owners) and "+ New project". */
function HeaderActions({
  workspace,
  onNewProgram,
}: {
  workspace: WorkspaceSummary;
  onNewProgram(): void;
}): ReactElement {
  const { openDialog } = useDialogs();
  const editable = canEdit(workspace);
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
      {editable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onNewProgram}
          className="border-input bg-card dark:bg-card"
        >
          <Layers aria-hidden="true" />
          New program
        </Button>
      )}
      <NewProjectButton disabled={!editable} />
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

function GroupedByProgram({
  state,
  layout,
  programs,
  hasActiveFilters,
  onRenameProgram,
  onDeleteProgram,
}: {
  state: ContentState;
  layout: ProjectsLayout;
  programs: readonly Program[];
  hasActiveFilters: boolean;
  onRenameProgram(program: Program): void;
  onDeleteProgram(program: Program): void;
}): ReactElement {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  if (state.kind !== 'ready') {
    return layout === 'list' ? <List state={state} /> : <Tiles state={state} />;
  }

  if (state.projects.length === 0 && (hasActiveFilters || programs.length === 0)) {
    return <div className="py-12">{state.empty}</div>;
  }

  const editable = canEdit(state.workspace);
  const owner = isOwner(state.workspace);
  const projectsByProgram = new Map<ID | null, ProjectSummary[]>();
  for (const project of state.projects) {
    const bucket = projectsByProgram.get(project.programId) ?? [];
    bucket.push(project);
    projectsByProgram.set(project.programId, bucket);
  }

  const sections: Array<{ key: string; program: Program | null; label: string; projects: ProjectSummary[] }> = [];
  for (const program of programs) {
    const list = projectsByProgram.get(program.id) ?? [];
    if (list.length > 0 || !hasActiveFilters) {
      sections.push({ key: program.id, program, label: program.name, projects: list });
    }
  }
  const unassigned = projectsByProgram.get(null) ?? [];
  if (unassigned.length > 0) {
    sections.push({ key: '__none__', program: null, label: 'No program', projects: unassigned });
  }

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {sections.map(({ key, program, label, projects: sectionProjects }) => {
        const isCollapsed = collapsed.has(key);
        const sectionState: ContentState = {
          kind: 'ready',
          workspace: state.workspace,
          projects: sectionProjects,
          empty: (
            <p className="text-sm text-muted-foreground">No projects in this program yet.</p>
          ),
        };
        return (
          <section key={key} aria-label={label} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggle(key)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:text-foreground',
                  FOCUS_OUTLINE_CLASSES,
                )}
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold">{label}</h2>
                <span className="text-xs text-muted-foreground">
                  · {pluralize(sectionProjects.length, 'project')}
                </span>
              </button>

              {program !== null && editable && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Manage program ${program.name}`}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-md bg-card text-muted-foreground ring-1 ring-edge hover:bg-accent hover:text-foreground',
                        FOCUS_OUTLINE_CLASSES,
                      )}
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      className={MENU_ITEM_CLASSES}
                      onSelect={() => onRenameProgram(program)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Rename program…
                    </DropdownMenuItem>
                    {owner && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          className={MENU_ITEM_CLASSES}
                          onSelect={() => onDeleteProgram(program)}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Delete program…
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {!isCollapsed &&
              (sectionProjects.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center text-sm text-muted-foreground">
                  No projects assigned to this program yet.
                </div>
              ) : layout === 'list' ? (
                <List state={sectionState} />
              ) : (
                <Tiles state={sectionState} />
              ))}
          </section>
        );
      })}
    </div>
  );
}

/** The workspace's projects, filtered and sorted as the URL asks (spec §6.2, P4 later §7.3). */
export function ProjectsPage(): ReactElement {
  const { workspaceId } = useParams();
  const workspaces = useWorkspaces();
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);
  // Only a workspace of mine has projects to list, so an unknown id never asks for them.
  const projects = useWorkspaceProjects(workspace?.id);
  const programs = useWorkspacePrograms(workspace?.id);
  const deleteProgram = useDeleteProgram();
  const [layout, setLayout] = useProjectsLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const [programDialogTarget, setProgramDialogTarget] = useState<ProgramDialogTarget | null>(null);
  const [deletingProgram, setDeletingProgram] = useState<Program | null>(null);
  const { q, status, stage, sort, group } = readProjectsView(searchParams);

  const visible = useMemo(
    () =>
      projects.data === undefined
        ? undefined
        : sortProjects(filterProjects(projects.data, { q, status, stage, sort, group }), sort),
    [projects.data, q, status, stage, sort, group],
  );

  // An unknown workspace, or one that isn't mine, once the list of mine has loaded.
  if (workspaces.data !== undefined && workspace === undefined) return <NotFoundPage />;

  function clearFilters(): void {
    setSearchParams(withoutFilters(searchParams), { replace: true });
  }

  async function handleConfirmDeleteProgram(): Promise<void> {
    if (!deletingProgram) return;
    try {
      await deleteProgram.mutateAsync(deletingProgram.id);
      toast.success('Program deleted');
      setDeletingProgram(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
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

  const hasActiveFilters = q.trim() !== '' || status !== null || stage !== null;

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
        {workspace !== undefined && (
          <HeaderActions
            workspace={workspace}
            onNewProgram={() =>
              setProgramDialogTarget({ mode: 'create', workspaceId: workspace.id })
            }
          />
        )}
      </div>
      <ProjectsToolbar layout={layout} onLayoutChange={setLayout} />
      {group === 'program' ? (
        <GroupedByProgram
          state={state}
          layout={layout}
          programs={programs.data ?? []}
          hasActiveFilters={hasActiveFilters}
          onRenameProgram={(program) => setProgramDialogTarget({ mode: 'rename', program })}
          onDeleteProgram={(program) => setDeletingProgram(program)}
        />
      ) : layout === 'list' ? (
        <List state={state} />
      ) : (
        <Tiles state={state} />
      )}

      {programDialogTarget !== null && (
        <ProgramDialog
          target={programDialogTarget}
          onClose={() => setProgramDialogTarget(null)}
        />
      )}

      <AlertDialog
        open={deletingProgram !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingProgram(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingProgram ? `Delete ${deletingProgram.name}?` : 'Delete program?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Projects in this program will stay in the workspace under No program.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                void handleConfirmDeleteProgram();
              }}
            >
              Delete program
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
