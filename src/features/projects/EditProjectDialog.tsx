import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { DialogShell } from '@/components/common/FormDialog';
import { SectionError } from '@/components/common/SectionError';
import { Skeleton } from '@/components/ui/skeleton';
import type { ID } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { NewProjectWizard } from '@/features/projects/NewProjectWizard';
import { canEdit } from '@/features/workspaces/roles';
import { useProject } from '@/hooks/useProjects';
import { useWorkspaces } from '@/hooks/useWorkspaces';

/**
 * How long the reads may take before the skeleton shows. A quicker read opens the dialog on the
 * wizard at once, instead of flashing a skeleton and then opening the wizard's own dialog.
 */
const SKELETON_DELAY_MS = 300;

/** The dialog while the project and the workspaces load: the wizard's stepper and first fields. */
function LoadingShell({ onClose }: { onClose: () => void }): ReactElement | null {
  const [due, setDue] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDue(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!due) return null;
  return (
    <DialogShell title="Edit project" width="xl" onCloseRequest={onClose}>
      <div className="flex flex-col gap-4">
        <span className="sr-only">Loading project…</span>
        <div data-testid="edit-project-skeleton" aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-5 w-72 max-w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="h-30" />
          <Skeleton className="h-20" />
        </div>
      </div>
    </DialogShell>
  );
}

/**
 * "Edit project" (P3 core spec §6.4, D20): the project wizard in edit mode on the project, or read
 * only as "Project details" for a viewer of its workspace. While the project or the workspaces
 * load, the dialog holds a skeleton; a failed read shows its error with Retry. A project outside
 * the given workspace, or a workspace that isn't one of mine, counts as a failed read.
 */
export function EditProjectDialog({
  workspaceId,
  projectId,
}: {
  workspaceId: ID;
  projectId: ID;
}): ReactElement {
  const { closeDialog } = useDialogs();
  const project = useProject(workspaceId, projectId);
  const workspaces = useWorkspaces();
  const workspace = workspaces.data?.find((item) => item.id === workspaceId);

  const elsewhere = project.data !== undefined && project.data.workspaceId !== workspaceId;
  if (project.data !== undefined && workspace !== undefined && !elsewhere) {
    return (
      <NewProjectWizard
        mode={{ kind: 'edit', project: project.data, workspace, readOnly: !canEdit(workspace) }}
      />
    );
  }

  const missing = (workspaces.isSuccess && workspace === undefined) || elsewhere;
  if (!project.isError && !workspaces.isError && !missing) {
    return <LoadingShell onClose={closeDialog} />;
  }

  function retry(): void {
    if (project.isError) void project.refetch();
    if (workspaces.isError || missing) void workspaces.refetch();
  }

  return (
    <DialogShell title="Edit project" width="xl" onCloseRequest={closeDialog}>
      <SectionError error={project.error ?? workspaces.error} onRetry={retry} className="py-6" />
    </DialogShell>
  );
}
