import { useRef } from 'react';
import type { ReactElement } from 'react';
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

/**
 * Confirmation dialog shown when discarding unsaved changes or leaving a dirty schedule
 * (spec §7.2, D7).
 */
export function DirtyLeaveDialog({
  open,
  onKeep,
  onDiscard,
}: {
  open: boolean;
  onKeep(): void;
  onDiscard(): void;
}): ReactElement {
  // Radix AlertDialogAction triggers onOpenChange(false) right after onClick; guard so
  // clicking "Discard" doesn't also invoke onKeep().
  const discardingRef = useRef(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          discardingRef.current = false;
        } else if (!discardingRef.current) {
          onKeep();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved schedule changes. If you discard them, your edits since the last save
            will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              discardingRef.current = false;
              onKeep();
            }}
          >
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              discardingRef.current = true;
              onDiscard();
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
