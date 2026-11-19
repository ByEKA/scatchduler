import type { ReactElement } from 'react';
import { FormDialogPresence } from '@/components/common/FormDialog';
import {
  DialogScope,
  useDialogHostState,
  type DialogEntry,
} from '@/features/dialogs/DialogsProvider';
import { ScheduleDetailsDialog } from '@/features/files/ScheduleDetailsDialog';
import { ImportReportDialog } from '@/features/import/ImportReportDialog';
import { ImportScheduleDialog } from '@/features/import/ImportScheduleDialog';
import { EditProjectDialog } from '@/features/projects/EditProjectDialog';
import { NewProjectWizard } from '@/features/projects/NewProjectWizard';
import { NewScheduleDialog } from '@/features/schedules/NewScheduleDialog';
import { NewTeamWorkspaceDialog } from '@/features/workspaces/NewTeamWorkspaceDialog';
import { WorkspaceMembersDialog } from '@/features/workspaces/WorkspaceMembersDialog';

function renderDialog(entry: DialogEntry): ReactElement | null {
  switch (entry.kind) {
    case 'newSchedule':
      return <NewScheduleDialog projectId={entry.options.projectId} />;
    case 'importSchedule':
      return <ImportScheduleDialog projectId={entry.options.projectId} />;
    case 'importReport':
      return entry.options.projectId === undefined ||
        entry.options.scheduleId === undefined ? null : (
        <ImportReportDialog
          projectId={entry.options.projectId}
          scheduleId={entry.options.scheduleId}
        />
      );
    case 'scheduleDetails':
      return entry.options.projectId === undefined ||
        entry.options.scheduleId === undefined ? null : (
        <ScheduleDetailsDialog
          projectId={entry.options.projectId}
          scheduleId={entry.options.scheduleId}
        />
      );
    case 'newProject':
      return <NewProjectWizard />;
    case 'editProject':
      // Without both ids there is no project to edit.
      return entry.options.workspaceId === undefined ||
        entry.options.projectId === undefined ? null : (
        <EditProjectDialog
          workspaceId={entry.options.workspaceId}
          projectId={entry.options.projectId}
        />
      );
    case 'newTeamWorkspace':
      return <NewTeamWorkspaceDialog />;
    case 'workspaceMembers':
      // Without a workspace there are no members to show.
      return entry.options.workspaceId === undefined ? null : (
        <WorkspaceMembersDialog workspaceId={entry.options.workspaceId} />
      );
    default:
      // A kind without a registered dialog renders nothing.
      return null;
  }
}

/**
 * Renders the open dialog. A closed dialog stays mounted until its exit animation has played;
 * a newly opened one replaces it at once.
 */
export function DialogHost(): ReactElement | null {
  const { active, closing, finishClosing } = useDialogHostState();
  const entry = active ?? closing;
  if (entry === null) return null;
  return (
    <DialogScope key={entry.id} id={entry.id}>
      <FormDialogPresence
        open={entry === active}
        opener={entry.opener}
        onExitComplete={() => finishClosing(entry.id)}
      >
        {renderDialog(entry)}
      </FormDialogPresence>
    </DialogScope>
  );
}
