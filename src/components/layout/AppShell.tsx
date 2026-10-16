import type { ReactElement } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { DialogHost } from '@/features/dialogs/DialogHost';
import { DialogsProvider } from '@/features/dialogs/DialogsProvider';
import { CurrentContextProvider } from '@/hooks/useCurrentContext';
import { SidebarStateProvider } from '@/hooks/useSidebarState';

/** Visually hidden until focused; the first focusable element of the page (spec §6.12). */
function SkipLink(): ReactElement {
  // The fixed wrapper places the link once `not-sr-only` makes it static; the inner span carries
  // the padding, which `not-sr-only` resets on the link itself.
  return (
    <div className="fixed top-2 left-2 z-50">
      <a
        href="#main"
        className="sr-only block rounded-md bg-primary text-sm font-medium text-primary-foreground focus:not-sr-only focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="block px-3 py-2">Skip to content</span>
      </a>
    </div>
  );
}

/**
 * The signed-in layout route (spec §4.3, §6.3): a 48 px top bar over the sidebar and `main`.
 * Only `main` scrolls.
 */
export function AppShell(): ReactElement {
  return (
    <CurrentContextProvider>
      <SidebarStateProvider>
        <DialogsProvider>
          <div className="grid h-dvh grid-cols-[auto_1fr] grid-rows-[48px_1fr]">
            <SkipLink />
            <TopBar />
            <Sidebar />
            {/* col-start-2: below 1024 px the sidebar is a drawer and the first column stays empty. */}
            <main
              id="main"
              tabIndex={-1}
              className="col-start-2 min-w-0 [scrollbar-gutter:stable] overflow-y-auto bg-background px-3 pt-3 pb-6 outline-none lg:px-4"
            >
              <div className="mx-auto max-w-[1600px]">
                <Outlet />
              </div>
            </main>
          </div>
          <DialogHost />
        </DialogsProvider>
      </SidebarStateProvider>
    </CurrentContextProvider>
  );
}
