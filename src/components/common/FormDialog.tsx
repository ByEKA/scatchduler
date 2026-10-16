import { Loader2, XIcon } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive, Dialog as DialogPrimitive } from 'radix-ui';
import { createContext, useContext, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent, ReactElement, ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Dialog widths from spec §6.7: team workspace 440, new schedule 520, import 560, new project 640.
const WIDTH_CLASSES = {
  sm: 'w-[440px]',
  md: 'w-[520px]',
  lg: 'w-[560px]',
  xl: 'w-[640px]',
} as const;

// Spec §6.7 overlay and §6.11 dialog motion, shared by the form dialog and its "Discard changes?"
// confirmation. The generated content components zoom from 95 % with the default easing.
const OVERLAY_CLASSES = 'bg-black/60 backdrop-blur-[2px] duration-200 ease-out';
const CONTENT_MOTION_CLASSES =
  'duration-200 ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-98';

interface Presence {
  open: boolean;
  /** Gets focus back when the dialog closes; `null` leaves focus where it is. */
  opener: Element | null;
  onExitComplete: () => void;
}

const PresenceContext = createContext<Presence>({
  open: true,
  opener: null,
  onExitComplete: () => {},
});

/**
 * Set by DialogHost. With `open` false the dialog plays its exit animation, returns focus to
 * `opener` and calls `onExitComplete` so the host can unmount it. Without this provider a
 * FormDialog stays open.
 */
export function FormDialogPresence({
  open,
  opener,
  onExitComplete,
  children,
}: Presence & { children: ReactNode }): ReactElement {
  return <PresenceContext value={{ open, opener, onExitComplete }}>{children}</PresenceContext>;
}

// Runs an action that leaves the form, such as a link that replaces the dialog with another one.
const LeaveFormContext = createContext<(action: () => void) => void>((action) => action());

/**
 * For controls inside a FormDialog that leave it: the returned function runs `action` at once on a
 * pristine form, after "Discard" on a changed one, and not at all while saving (spec §6.7).
 * Outside a FormDialog it runs `action` at once.
 */
export function useLeaveForm(): (action: () => void) => void {
  return useContext(LeaveFormContext);
}

function focusIfConnected(element: Element | null): void {
  if (element instanceof HTMLElement && element.isConnected && element !== document.body) {
    element.focus();
  }
}

/** True when the focused element was removed with a closed dialog, so focus has nowhere to be. */
function focusIsLost(): boolean {
  const focused = document.activeElement;
  return focused === null || focused === document.body || !focused.isConnected;
}

export interface FormDialogProps {
  title: string;
  /** Muted text under the title; the dialog is described by it. */
  description?: string;
  /** Shown under the title and description, outside the scrolling body (the wizard's stepper). */
  header?: ReactNode;
  /** sm 440 px, md 520 px, lg 560 px, xl 640 px. */
  width: 'sm' | 'md' | 'lg' | 'xl';
  isDirty: boolean;
  isPending: boolean;
  submitLabel: string;
  pendingLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  /** Called when a close request is accepted: at once for a pristine form, after "Discard" otherwise. */
  onClose: () => void;
  children: ReactNode;
  submitDisabled?: boolean;
  /** Replaces the content of the footer row (right-aligned, gap 8). */
  footer?: (helpers: { requestClose: () => void }) => ReactNode;
  /** Radix's open auto-focus event; call `event.preventDefault()` before focusing a field yourself. */
  onOpenAutoFocus?: (event: Event) => void;
  /** Sees every keydown in the form, footer included, before the focused control does. */
  onKeyDownCapture?: (event: KeyboardEvent<HTMLFormElement>) => void;
}

/**
 * A modal form (spec §6.7 dialog table): header, scrolling body, footer, and a "Discard changes?"
 * confirmation when a dirty form is closed. It renders open; DialogHost decides when it exists.
 */
export function FormDialog({
  title,
  description,
  header,
  width,
  isDirty,
  isPending,
  submitLabel,
  pendingLabel,
  onSubmit,
  onClose,
  children,
  submitDisabled = false,
  footer,
  onOpenAutoFocus,
  onKeyDownCapture,
}: FormDialogProps): ReactElement {
  const { open, opener, onExitComplete } = useContext(PresenceContext);
  // Set while "Discard changes?" is open. `leaveFor` is the action a control asked to leave for;
  // without one, "Discard" closes the dialog.
  const [confirm, setConfirm] = useState<{ leaveFor?: () => void } | null>(null);
  // Radix returns focus to a DialogTrigger, and these dialogs open without one: DialogHost passes
  // the opener, and the dialog remembers what had focus before the confirmation opened.
  const beforeConfirmRef = useRef<Element | null>(null);
  function leave(action?: () => void): void {
    // While saving, the dialog stays open, so a failed save keeps the form and its values
    // (spec §6.10).
    if (!open || isPending) return;
    if (!isDirty) {
      (action ?? onClose)();
      return;
    }
    setConfirm({ leaveFor: action });
  }

  function requestClose(): void {
    leave();
  }

  function discard(): void {
    const next = confirm?.leaveFor ?? onClose;
    setConfirm(null);
    next();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    if (isPending || !open) {
      event.preventDefault();
      return;
    }
    onSubmit(event);
  }

  function handleCloseAutoFocus(event: Event): void {
    event.preventDefault();
    // Still open: another dialog replaced this one and has taken focus.
    if (open) return;
    onExitComplete();
    // If focus moved on during the exit animation (Tab out of the closing dialog, or a dialog
    // opened meanwhile), it stays where it went.
    if (focusIsLost()) focusIfConnected(opener);
  }

  function handleConfirmOpenAutoFocus(): void {
    // Runs before Radix moves focus to "Keep editing".
    beforeConfirmRef.current = document.activeElement;
  }

  function handleConfirmCloseAutoFocus(event: Event): void {
    event.preventDefault();
    // After "Keep editing", focus goes back to where it was; after "Discard" the dialog closes.
    if (open) focusIfConnected(beforeConfirmRef.current);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogPortal>
          <DialogOverlay className={OVERLAY_CLASSES} />
          <DialogPrimitive.Content
            onOpenAutoFocus={onOpenAutoFocus}
            onCloseAutoFocus={handleCloseAutoFocus}
            className={cn(
              'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-xl border bg-popover p-6 text-popover-foreground shadow-popover outline-none',
              CONTENT_MOTION_CLASSES,
              WIDTH_CLASSES[width],
            )}
          >
            <div className="flex shrink-0 flex-col gap-1 pr-8">
              <DialogTitle className="text-md font-semibold">{title}</DialogTitle>
              {description !== undefined && <DialogDescription>{description}</DialogDescription>}
              {header}
            </div>
            <form
              noValidate
              onSubmit={handleSubmit}
              onKeyDownCapture={onKeyDownCapture}
              className="flex min-h-0 flex-1 flex-col gap-5"
            >
              {/* The negative margins give focus rings room inside the scroll container. */}
              <div className="-mx-6 -my-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-1">
                <LeaveFormContext value={leave}>{children}</LeaveFormContext>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2">
                {footer ? (
                  footer({ requestClose })
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      onClick={requestClose}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending || submitDisabled}>
                      {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
                      {isPending ? pendingLabel : submitLabel}
                    </Button>
                  </>
                )}
              </div>
            </form>
            {/* Last in the DOM so Radix focuses the first field, not this button, on open. */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              disabled={isPending}
              onClick={requestClose}
              className="absolute top-5 right-5 size-7 text-muted-foreground hover:text-foreground"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className={OVERLAY_CLASSES} />
          {/* data-size and the group class keep the header and footer layout of the ui component's
              size "sm" (centered title, two equal buttons). */}
          <AlertDialogPrimitive.Content
            data-slot="alert-dialog-content"
            data-size="sm"
            onOpenAutoFocus={handleConfirmOpenAutoFocus}
            onCloseAutoFocus={handleConfirmCloseAutoFocus}
            className={cn(
              'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-80 max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-popover p-6 text-popover-foreground shadow-popover outline-none',
              CONTENT_MOTION_CLASSES,
            )}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="text-md">Discard changes?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel variant="secondary">Keep editing</AlertDialogCancel>
              <AlertDialogAction onClick={discard}>Discard</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  );
}
