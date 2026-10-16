import type { ReactElement } from 'react';
import { FormDialogPresence } from '@/components/common/FormDialog';
import {
  DialogScope,
  useDialogHostState,
  type DialogEntry,
} from '@/features/dialogs/DialogsProvider';
import { ImportScheduleDialog } from '@/features/schedules/ImportScheduleDialog';
import { NewScheduleDialog } from '@/features/schedules/NewScheduleDialog';
import { NewTeamWorkspaceDialog } from '@/features/workspaces/NewTeamWorkspaceDialog';

function renderDialog(entry: DialogEntry): ReactElement | null {
  switch (entry.kind) {
    case 'newSchedule':
      return <NewScheduleDialog projectId={entry.options.projectId} />;
    case 'importSchedule':
      return <ImportScheduleDialog projectId={entry.options.projectId} />;
    case 'newTeamWorkspace':
      return <NewTeamWorkspaceDialog />;
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
