import type { ReactElement } from 'react';
import { SidebarNav } from '@/components/layout/SidebarNav';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useSidebarState } from '@/hooks/useSidebarState';

// Radix leaves links out when it picks the element to focus on open, so a drawer of links would
// focus its own container. Start on the current page's item, or the first item, instead.
function focusNavItem(event: Event): void {
  if (!(event.currentTarget instanceof HTMLElement)) return;
  const item =
    event.currentTarget.querySelector<HTMLElement>('[aria-current="page"]') ??
    event.currentTarget.querySelector<HTMLElement>('a[href], [tabindex="0"]');
  if (item === null) return;
  event.preventDefault();
  item.focus();
}

// The TopBar toggle controls the sidebar but sits outside the Sheet, so Radix can't return focus
// to it as it would to a SheetTrigger.
function focusSidebarToggle(event: Event): void {
  const toggle = document.querySelector<HTMLElement>('[aria-controls="app-sidebar"]');
  if (toggle === null) return;
  event.preventDefault();
  toggle.focus();
}

/**
 * From 1024 px an inline grid column (176 px, 0 when closed); below that a left drawer (spec §6.5).
 */
export function Sidebar(): ReactElement {
  const { mode, open, setOpen } = useSidebarState();

  if (mode === 'drawer') {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          id="app-sidebar"
          side="left"
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={focusNavItem}
          onCloseAutoFocus={focusSidebarToggle}
          className="w-60 gap-0 overflow-y-auto border-sidebar-border bg-sidebar p-3 ease-standard data-[state=closed]:duration-200 data-[state=open]:duration-200 sm:max-w-none"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      id="app-sidebar"
      data-state={open ? 'open' : 'closed'}
      aria-hidden={open ? undefined : true}
      inert={!open}
      className="group/sidebar w-44 overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-standard data-[state=closed]:w-0 data-[state=closed]:border-r-0"
    >
      {/* Fixed at 176 px so the items don't reflow while the column narrows. */}
      <div className="h-full w-44 overflow-y-auto p-3 transition-opacity duration-200 ease-standard group-data-[state=closed]/sidebar:opacity-0">
        <SidebarNav />
      </div>
    </aside>
  );
}
