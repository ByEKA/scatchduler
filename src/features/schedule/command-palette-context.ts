import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export interface SchedulePaletteActivityItem {
  id: string;
  code: string;
  name: string;
}

export interface SchedulePaletteWbsItem {
  id: string;
  code: string;
  name: string;
}

export interface SchedulePaletteCommandItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onSelect(): void;
}

export interface SchedulePaletteRegistration {
  activities: readonly SchedulePaletteActivityItem[];
  wbs: readonly SchedulePaletteWbsItem[];
  commands: readonly SchedulePaletteCommandItem[];
  onJumpToActivity(activityId: string): void;
  onSelectWbs(wbsId: string): void;
}

export interface SchedulePaletteStore {
  getSnapshot(): SchedulePaletteRegistration | null;
  subscribe(listener: () => void): () => void;
  setRegistration(reg: SchedulePaletteRegistration | null): void;
}

export function createSchedulePaletteStore(): SchedulePaletteStore {
  let current: SchedulePaletteRegistration | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setRegistration: (reg) => {
      if (current === reg) return;
      current = reg;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

export interface CommandPaletteContextValue {
  open: boolean;
  setOpen(open: boolean): void;
  toggle(): void;
  store: SchedulePaletteStore;
}

const NOOP_CONTEXT: CommandPaletteContextValue = {
  open: false,
  setOpen: () => undefined,
  toggle: () => undefined,
  store: createSchedulePaletteStore(),
};

export const CommandPaletteContext = createContext<CommandPaletteContextValue>(NOOP_CONTEXT);

export function useCommandPalette(): CommandPaletteContextValue {
  return useContext(CommandPaletteContext);
}

export function useSchedulePaletteRegistration(): SchedulePaletteRegistration | null {
  const { store } = useCommandPalette();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * Registers the active schedule's activities, WBS nodes and editor actions with the global
 * `Ctrl+K` command palette while `SchedulePage` is mounted.
 */
export function useRegisterSchedulePalette(registration: SchedulePaletteRegistration | null): void {
  const { store } = useCommandPalette();
  useEffect(() => {
    store.setRegistration(registration);
  }, [registration, store]);
  useEffect(() => {
    return () => {
      store.setRegistration(null);
    };
  }, [store]);
}
