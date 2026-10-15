import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ID } from '@/data/types';

export type DialogKind = 'newSchedule' | 'importSchedule' | 'newProject' | 'newTeamWorkspace';

export interface DialogOptions {
  projectId?: ID;
}

export interface ActiveDialog {
  kind: DialogKind;
  options: DialogOptions;
}

export interface DialogsValue {
  active: ActiveDialog | null;
  /** Opens a dialog; it replaces any dialog that is open. */
  openDialog(kind: DialogKind, options?: DialogOptions): void;
  /**
   * Closes the open dialog. Inside a dialog that DialogHost renders, it closes that dialog only
   * and does nothing once another dialog has replaced it, so a late save can't close the next one.
   */
  closeDialog(): void;
}

/** One opening of a dialog; `id` tells two openings of the same kind apart. */
export interface DialogEntry extends ActiveDialog {
  id: number;
  /**
   * The element that had focus when the dialog opened; focus returns to it on close. A dialog
   * that replaces another takes over that dialog's opener.
   */
  opener: Element | null;
}

interface DialogsState {
  active: DialogEntry | null;
  /** The dialog closed last, kept mounted until its exit animation has played. */
  closing: DialogEntry | null;
  nextId: number;
}

export interface DialogHostState {
  active: DialogEntry | null;
  closing: DialogEntry | null;
  /** Closes the dialog with this id if it is still the open one. */
  closeEntry(id: number): void;
  /** DialogHost calls this when the closed dialog's exit animation has ended. */
  finishClosing(id: number): void;
}

const DialogsContext = createContext<DialogsValue | null>(null);
const DialogHostContext = createContext<DialogHostState | null>(null);

function closeIf(state: DialogsState, matches: (active: DialogEntry) => boolean): DialogsState {
  return state.active !== null && matches(state.active)
    ? { ...state, active: null, closing: state.active }
    : state;
}

/** Holds the one open dialog (spec §4.6); DialogHost renders it. */
export function DialogsProvider({ children }: { children: ReactNode }): ReactElement {
  const [state, setState] = useState<DialogsState>({ active: null, closing: null, nextId: 1 });

  const openDialog = useCallback((kind: DialogKind, options: DialogOptions = {}) => {
    const focused = document.activeElement;
    setState((current) => {
      // Focus sits inside the dialog being replaced, so the new one keeps that dialog's opener.
      const replaced = current.active ?? current.closing;
      return {
        active: { kind, options, id: current.nextId, opener: replaced ? replaced.opener : focused },
        closing: null,
        nextId: current.nextId + 1,
      };
    });
  }, []);

  const closeDialog = useCallback(() => {
    setState((current) => closeIf(current, () => true));
  }, []);

  const closeEntry = useCallback((id: number) => {
    setState((current) => closeIf(current, (active) => active.id === id));
  }, []);

  const finishClosing = useCallback((id: number) => {
    setState((current) => (current.closing?.id === id ? { ...current, closing: null } : current));
  }, []);

  const value = useMemo(
    () => ({ active: state.active, openDialog, closeDialog }),
    [state.active, openDialog, closeDialog],
  );
  const hostValue = useMemo(
    () => ({ active: state.active, closing: state.closing, closeEntry, finishClosing }),
    [state.active, state.closing, closeEntry, finishClosing],
  );

  return (
    <DialogsContext value={value}>
      <DialogHostContext value={hostValue}>{children}</DialogHostContext>
    </DialogsContext>
  );
}

export function useDialogs(): DialogsValue {
  const context = useContext(DialogsContext);
  if (!context) throw new Error('useDialogs must be used inside DialogsProvider');
  return context;
}

/** The open and the closing dialog, for DialogHost only. */
export function useDialogHostState(): DialogHostState {
  const context = useContext(DialogHostContext);
  if (!context) throw new Error('DialogHost must be used inside DialogsProvider');
  return context;
}

/** DialogHost wraps each dialog in this, so useDialogs().closeDialog() closes only that dialog. */
export function DialogScope({ id, children }: { id: number; children: ReactNode }): ReactElement {
  const dialogs = useDialogs();
  const { closeEntry } = useDialogHostState();
  const value = useMemo(
    () => ({ ...dialogs, closeDialog: () => closeEntry(id) }),
    [dialogs, closeEntry, id],
  );
  return <DialogsContext value={value}>{children}</DialogsContext>;
}
