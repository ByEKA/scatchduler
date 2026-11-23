import { PanelLeft, Search } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { PlanBadge } from '@/components/layout/PlanBadge';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';
import { ScheduleSwitcher } from '@/components/layout/ScheduleSwitcher';
import { UserMenu } from '@/components/layout/UserMenu';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { useCommandPalette } from '@/features/schedule/command-palette-context';
import { useSidebarState } from '@/hooks/useSidebarState';

function toggleLabel(mode: 'inline' | 'drawer', open: boolean): string {
  if (mode === 'drawer') return 'Open navigation';
  return open ? 'Hide sidebar' : 'Show sidebar';
}

/**
 * The top bar (spec §6.4, P4 §7.1). Left: sidebar toggle, logo, workspace, project and schedule
 * switchers. Right: command palette trigger, plan badge and account menu.
 */
export function TopBar(): ReactElement {
  const { mode, open, toggle } = useSidebarState();
  const { setOpen: setPaletteOpen } = useCommandPalette();
  return (
    <header className="col-span-2 flex h-12 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:gap-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={toggleLabel(mode, open)}
          aria-expanded={open}
          aria-controls="app-sidebar"
          onClick={toggle}
          className="text-muted-foreground hover:text-foreground pointer-coarse:h-10"
        >
          <PanelLeft className="size-[18px]" aria-hidden="true" />
        </Button>
        <Link
          to="/home"
          aria-label={`${brand.name} home`}
          // Hidden below 640 px with CSS only (spec §6.9, D10).
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-md:hidden"
        >
          <BrandLogo />
        </Link>
        <WorkspaceSwitcher />
        <ProjectSwitcher />
        <ScheduleSwitcher />
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <Button
          variant="outline"
          size="sm"
          aria-label="Command palette"
          onClick={() => setPaletteOpen(true)}
          className="h-7 gap-2 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span className="max-sm:hidden">Search…</span>
          <kbd className="rounded-xs border border-border bg-muted px-1 py-0.5 font-mono text-2xs text-muted-foreground max-sm:hidden">
            Ctrl+K
          </kbd>
        </Button>
        <PlanBadge />
        <UserMenu />
      </div>
    </header>
  );
}
