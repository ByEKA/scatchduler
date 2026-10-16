import { Check, ChevronRight, House, Plus, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import { SectionError } from '@/components/common/SectionError';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Skeleton } from '@/components/ui/skeleton';
import type { WorkspaceSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';

// Spec §6.6: full-width rows 52 tall, 16 px side padding, 12 px gaps. Rows run edge to edge in a
// panel that clips its overflow, so the focus outline is drawn inside the row.
const ROW_CLASSES = 'flex h-[52px] w-full items-center gap-3 px-4 text-left';

const ROW_FOCUS_CLASSES =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring';

const LINK_BUTTON_CLASSES = cn(
  'flex items-center gap-1 rounded-sm text-sm font-bold text-link underline-offset-2 hover:underline',
  FOCUS_OUTLINE_CLASSES,
);

function WorkspaceRow({
  workspace,
  current,
  onSelect,
}: {
  workspace: WorkspaceSummary;
  current: boolean;
  onSelect(): void;
}): ReactElement {
  const Icon = workspace.kind === 'personal' ? House : Users;
  return (
    <button
      type="button"
      aria-current={current ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        ROW_CLASSES,
        ROW_FOCUS_CLASSES,
        'transition-colors duration-150 ease-standard',
        current ? 'bg-sidebar-accent' : 'hover:bg-accent/60',
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-600 text-primary-foreground"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-sm font-semibold" title={workspace.name}>
          {workspace.name}
        </span>
        {/* The current row also shows a check mark, so it doesn't rely on its color alone. */}
        {current && <Check className="size-3.5 shrink-0 text-link" aria-hidden="true" />}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {pluralize(workspace.projectCount, 'project')}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

function SkeletonRow(): ReactElement {
  return (
    <div data-testid="workspace-row-skeleton" aria-hidden="true" className={ROW_CLASSES}>
      <Skeleton className="size-8 shrink-0" />
      <Skeleton className="h-3.5 w-2/5" />
      <Skeleton className="ml-auto h-3 w-16" />
    </div>
  );
}

function NewTeamWorkspaceButton(): ReactElement {
  const { openDialog } = useDialogs();
  return (
    <button
      type="button"
      onClick={() => openDialog('newTeamWorkspace')}
      className={LINK_BUTTON_CLASSES}
    >
      <Plus className="size-3.5" aria-hidden="true" />
      New team workspace
    </button>
  );
}

/**
 * The "New team workspace" button, with the dashed tile and "No team workspaces yet" while the
 * user has no team workspace (spec §6.6). Both states share this element, so the button that
 * opened the dialog stays mounted when the first team workspace arrives and gets focus back.
 */
function TeamWorkspaceFooter({ hasTeam }: { hasTeam: boolean }): ReactElement {
  return (
    <div className={hasTeam ? 'px-4 py-3' : 'flex items-center gap-4 p-4'}>
      {!hasTeam && (
        <span
          aria-hidden="true"
          className="flex h-12 w-16 shrink-0 items-center justify-center gap-0.5 rounded-md border border-dashed border-input text-muted-foreground"
        >
          <Users className="size-5" />
          <Plus className="size-3" />
        </span>
      )}
      <div className="flex min-w-0 flex-col items-start gap-1">
        {!hasTeam && <p className="text-sm text-muted-foreground">No team workspaces yet</p>}
        <NewTeamWorkspaceButton />
      </div>
    </div>
  );
}

function Content(): ReactElement {
  const { status, error, workspaces, workspace, setWorkspace, retry } = useCurrentContext();

  // The rows need only the workspace list. The context also waits for the current workspace's
  // projects, but a failed or loading project list belongs to Recent projects, not to this panel.
  if (workspaces.length === 0) {
    if (status === 'error') return <SectionError error={error} onRetry={retry} />;
    if (status === 'loading') {
      return (
        <>
          <SkeletonRow />
          <SkeletonRow />
        </>
      );
    }
  }

  const hasTeam = workspaces.some((item) => item.kind === 'team');
  return (
    <>
      <ul>
        {workspaces.map((item) => (
          <li key={item.id}>
            <WorkspaceRow
              workspace={item}
              current={item.id === workspace?.id}
              onSelect={() => setWorkspace(item.id)}
            />
          </li>
        ))}
      </ul>
      <TeamWorkspaceFooter hasTeam={hasTeam} />
    </>
  );
}

/** Every workspace with its project count; a row opens that workspace (spec §6.6). */
export function WorkspacesPanel(): ReactElement {
  return (
    <section
      aria-labelledby="workspaces-heading"
      className="overflow-hidden rounded-lg bg-card ring-1 ring-edge"
    >
      <h2 id="workspaces-heading" className="px-4 pt-3 pb-2 text-sm font-bold">
        Workspaces
      </h2>
      <Content />
    </section>
  );
}
