import { Loader2 } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
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
import type { Schedule } from '@/data/types';
import { useDeleteSchedules } from '@/hooks/useSchedules';
import { errorMessage } from '@/lib/format';
import { cn } from '@/lib/utils';

function focusIfConnected(element: Element | null): boolean {
  if (element instanceof HTMLElement && element.isConnected && element !== document.body) {
    element.focus();
    return true;
  }
  return false;
}

// The page heading that takes focus when the opener has gone with the deleted schedule row.
const PAGE_HEADING_SELECTOR = 'h1[tabindex="-1"]';

// Keep the full ring color on destructive confirmation buttons (P1 spec §6.12).
const CONFIRM_CLASSES = 'focus-visible:ring-ring dark:focus-visible:ring-ring';

/**
 * "Delete schedule" confirmation (P3 core spec §6.3, R3, R10): deletes the schedule and its
 * stored original file. Two quick clicks send one request; a failure stays in the dialog.
 */
export function DeleteScheduleDialog({
  schedule,
  open,
  onOpenChange,
}: {
  schedule: Schedule;
  open: boolean;
  onOpenChange(open: boolean): void;
}): ReactElement {
  const deleteSchedules = useDeleteSchedules();
  const openerRef = useRef<Element | null>(null);
  // Set by the first confirmation and cleared only on failure, so rapid double clicks send one call.
  const submittingRef = useRef(false);
  const deletedRef = useRef(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Each opening clears any previous error.
  const [shownOpen, setShownOpen] = useState(open);
  if (shownOpen !== open) {
    setShownOpen(open);
    if (open) setFailure(null);
  }

  const pending = deleteSchedules.isPending;

  async function confirm(): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setFailure(null);
    try {
      await deleteSchedules.mutateAsync([schedule.id]);
      deletedRef.current = true;
      toast.success('Schedule deleted');
      onOpenChange(false);
    } catch (error) {
      submittingRef.current = false;
      setFailure(errorMessage(error));
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Stay open while deleting so any failure shows in place.
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogPortal>
        <AlertDialogOverlay className={DIALOG_OVERLAY_CLASSES} />
        <AlertDialogPrimitive.Content
          data-slot="alert-dialog-content"
          data-size="default"
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement;
            deletedRef.current = false;
            submittingRef.current = false;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!deletedRef.current && focusIfConnected(openerRef.current)) return;
            document.querySelector<HTMLElement>(PAGE_HEADING_SELECTOR)?.focus();
          }}
          className={cn(
            'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-[440px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-popover p-6 text-popover-foreground shadow-popover outline-none',
            DIALOG_CONTENT_MOTION_CLASSES,
          )}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="text-md">{`Delete ${schedule.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Stored original files are deleted too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {failure !== null && (
            <p role="alert" className="text-sm text-destructive">
              {failure}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => void confirm()}
              className={CONFIRM_CLASSES}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogPrimitive.Content>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
