import { Loader2 } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  DIALOG_CONTENT_MOTION_CLASSES,
  DIALOG_OVERLAY_CLASSES,
} from '@/components/common/dialog-classes';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ProjectSummary } from '@/data/types';
import { useDeleteProject } from '@/hooks/useProjects';
import { errorMessage, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';

/** What the deletion takes with it (P3 core spec §6.2); archived schedules count too. */
function deletionText(project: ProjectSummary): string {
  if (project.totalScheduleCount === 0) return "This deletes the project. It can't be undone.";
  const schedules = pluralize(project.totalScheduleCount, 'schedule');
  return `This deletes its ${schedules} and their stored files. It can't be undone.`;
}

/** True when `typed` is the project's code, ignoring case and outer spaces (spec §6.5). */
function isProjectCode(typed: string, code: string): boolean {
  return typed.trim().toLowerCase() === code.toLowerCase();
}

function focusIfConnected(element: Element | null): boolean {
  if (element instanceof HTMLElement && element.isConnected && element !== document.body) {
    element.focus();
    return true;
  }
  return false;
}

// The page heading that takes focus when the opener has gone with the deleted project (its card
// or row, or its pages); the Projects page's h1 has tabIndex -1 for this.
const PAGE_HEADING_SELECTOR = 'h1[tabindex="-1"]';

// The generated destructive button draws its focus ring at 20 %; the full ring color is what the
// other controls use (P1 spec §6.12).
const CONFIRM_CLASSES =
  'focus-visible:ring-ring aria-disabled:cursor-not-allowed aria-disabled:opacity-50 dark:focus-visible:ring-ring';

/**
 * "Delete project" (P3 core spec §6.2, R12): the owner types the project's ID before "Delete
 * project" does anything. A success shows the toast "Project deleted" and, when the user is on one
 * of the project's pages, opens the workspace's Projects page; a failure stays in the dialog.
 */
export function DeleteProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectSummary;
  open: boolean;
  onOpenChange(open: boolean): void;
}): ReactElement {
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // The element that had focus when the dialog opened; it gets focus back on close.
  const openerRef = useRef<Element | null>(null);
  // Set by the first confirmation and cleared only by a failure, so two quick clicks or a held
  // Enter send one request; after a success the dialog is closing (P1 D12).
  const submittingRef = useRef(false);
  // Set by a success: the opener belongs to the deleted project and is about to go with it.
  const deletedRef = useRef(false);
  const [typed, setTyped] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  // Each opening starts with an empty field and no error.
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (open) {
      setTyped('');
      setFailure(null);
    }
  }

  const pending = deleteProject.isPending;
  const confirmable = isProjectCode(typed, project.code) && !pending;

  async function confirm(): Promise<void> {
    if (!isProjectCode(typed, project.code) || submittingRef.current) return;
    submittingRef.current = true;
    setFailure(null);
    try {
      await deleteProject.mutateAsync({
        workspaceId: project.workspaceId,
        projectId: project.id,
      });
      deletedRef.current = true;
      toast.success('Project deleted');
      onOpenChange(false);
      // The project's own pages are gone, so the workspace's Projects page takes their place.
      if (pathname.startsWith(`/w/${project.workspaceId}/p/${project.id}/`)) {
        void navigate(`/w/${project.workspaceId}/projects`, { replace: true });
      }
    } catch (error) {
      submittingRef.current = false;
      setFailure(errorMessage(error));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void confirm();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // While deleting, the dialog stays open, so a failure can still show here.
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay className={DIALOG_OVERLAY_CLASSES} />
        {/* data-size and the group class keep the ui component's default header and footer
            layout (left-aligned title, buttons on the right from 640 px). */}
        <AlertDialogPrimitive.Content
          data-slot="alert-dialog-content"
          data-size="default"
          onOpenAutoFocus={(event) => {
            // Runs before Radix moves focus; the dialog focuses its field instead of Cancel.
            openerRef.current = document.activeElement;
            event.preventDefault();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // After a delete, or once the opener has left the page, focus would fall to the body;
            // the page heading keeps the keyboard's place instead.
            if (!deletedRef.current && focusIfConnected(openerRef.current)) return;
            document.querySelector<HTMLElement>(PAGE_HEADING_SELECTOR)?.focus();
          }}
          className={cn(
            'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-popover p-6 text-popover-foreground shadow-popover outline-none',
            DIALOG_CONTENT_MOTION_CLASSES,
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-md">{`Delete ${project.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>{deletionText(project)}</AlertDialogDescription>
          </AlertDialogHeader>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>Type the project ID to confirm</Label>
              <Input
                ref={inputRef}
                id={inputId}
                aria-label="Project ID"
                autoComplete="off"
                spellCheck={false}
                readOnly={pending}
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
            {failure !== null && (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel variant="secondary" disabled={pending}>
                Cancel
              </AlertDialogCancel>
              {/* aria-disabled keeps the button focusable and announced while it does nothing. */}
              <Button
                type="submit"
                variant="destructive"
                aria-disabled={confirmable ? undefined : 'true'}
                className={CONFIRM_CLASSES}
              >
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
                Delete project
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
