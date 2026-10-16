import { PanelLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { PlanBadge } from '@/components/layout/PlanBadge';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';
import { UserMenu } from '@/components/layout/UserMenu';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { useSidebarState } from '@/hooks/useSidebarState';

function toggleLabel(mode: 'inline' | 'drawer', open: boolean): string {
  if (mode === 'drawer') return 'Open navigation';
  return open ? 'Hide sidebar' : 'Show sidebar';
}

/**
 * The top bar (spec §6.4). Left: sidebar toggle, logo, workspace and project switchers. Right:
 * plan badge and account menu. The switchers shrink and truncate when space runs short.
 */
export function TopBar(): ReactElement {
  const { mode, open, toggle } = useSidebarState();
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
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <PlanBadge />
        <UserMenu />
      </div>
    </header>
  );
}
