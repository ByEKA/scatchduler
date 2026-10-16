import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useLocation } from 'react-router';
import { readKey, writeKey } from '@/lib/storage';

export interface SidebarState {
  /** `inline` from 1024 px up (a grid column), `drawer` below (a Sheet). */
  mode: 'inline' | 'drawer';
  open: boolean;
  toggle(): void;
  setOpen(open: boolean): void;
}

const INLINE_QUERY = '(min-width: 1024px)';
const OPEN_KEY = 'ui.sidebarOpen';

const SidebarStateContext = createContext<SidebarState | null>(null);

/**
 * Sidebar state (spec §4.5, §6.5). The inline sidebar's open state persists in `ui.sidebarOpen`.
 * The drawer is open only on the pathname it was opened on, so any navigation closes it.
 */
export function SidebarStateProvider({ children }: { children: ReactNode }): ReactElement {
  const { pathname } = useLocation();
  const [inlineQuery] = useState(() => window.matchMedia(INLINE_QUERY));
  const [inlineOpen, setInlineOpen] = useState(() => readKey(OPEN_KEY) !== 'false');
  const [drawerOpenedAt, setDrawerOpenedAt] = useState<string | null>(null);

  // Forget the drawer on every pathname change. Otherwise going back and then forward, or a link
  // to the page it was opened on, would open it again by itself.
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    setDrawerOpenedAt(null);
  }

  const subscribe = useCallback(
    (onChange: () => void) => {
      const handleChange = () => {
        // A drawer left open while the window was wide must not reappear when it narrows again.
        setDrawerOpenedAt(null);
        onChange();
      };
      inlineQuery.addEventListener('change', handleChange);
      return () => inlineQuery.removeEventListener('change', handleChange);
    },
    [inlineQuery],
  );
  const isInline = useSyncExternalStore(subscribe, () => inlineQuery.matches);

  const mode: SidebarState['mode'] = isInline ? 'inline' : 'drawer';
  const open = isInline ? inlineOpen : drawerOpenedAt === pathname;

  const setOpen = useCallback(
    (next: boolean) => {
      if (isInline) {
        setInlineOpen(next);
        writeKey(OPEN_KEY, String(next));
      } else {
        setDrawerOpenedAt(next ? pathname : null);
      }
    },
    [isInline, pathname],
  );
  const toggle = useCallback(() => setOpen(!open), [setOpen, open]);

  const value = useMemo(() => ({ mode, open, toggle, setOpen }), [mode, open, toggle, setOpen]);
  return <SidebarStateContext value={value}>{children}</SidebarStateContext>;
}

export function useSidebarState(): SidebarState {
  const context = useContext(SidebarStateContext);
  if (!context) throw new Error('useSidebarState must be used inside SidebarStateProvider');
  return context;
}
