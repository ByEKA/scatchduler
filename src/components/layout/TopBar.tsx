import { PanelLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/button';
import { brand } from '@/config/brand';
import { useSidebarState } from '@/hooks/useSidebarState';

function toggleLabel(mode: 'inline' | 'drawer', open: boolean): string {
  if (mode === 'drawer') return 'Open navigation';
  return open ? 'Hide sidebar' : 'Show sidebar';
}

/** The top bar (spec §6.4): sidebar toggle and logo. */
export function TopBar(): ReactElement {
  const { mode, open, toggle } = useSidebarState();
  return (
    <header className="col-span-2 flex h-12 items-center justify-between border-b border-border bg-card px-3">
      <div className="flex min-w-0 items-center gap-3">
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
          className="shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <BrandLogo />
        </Link>
      </div>
    </header>
  );
}
