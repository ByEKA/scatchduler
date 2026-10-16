import { defaultFilter } from 'cmdk';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { OPTION_CLASSES, POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import {
  FOCUS_OUTLINE_CLASSES,
  NameTooltip,
  UnavailableSwitcher,
} from '@/components/layout/top-bar-parts';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import type { ID } from '@/data/types';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { cn } from '@/lib/utils';

// Items carry the workspace id as their value, so two workspaces with the same name stay apart;
// the search matches the name only, which each item passes as its keyword.
function matchName(_value: string, search: string, keywords?: string[]): number {
  return defaultFilter(keywords?.join(' ') ?? '', search);
}

/**
 * Split control (spec §6.4): the workspace name links to its projects; the chevron opens a
 * searchable list of workspaces (spec §6.7).
 */
export function WorkspaceSwitcher(): ReactElement | null {
  const { status, workspaces, workspace, setWorkspace } = useCurrentContext();
  const [open, setOpen] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);

  if (status === 'error') return <UnavailableSwitcher />;
  if (workspace === null) {
    return status === 'loading' ? <Skeleton className="h-7 w-14 shrink-0 sm:w-36" /> : null;
  }

  const select = (id: ID) => {
    setOpen(false);
    setWorkspace(id);
  };

  return (
    <div className="flex h-7 min-w-0 items-center max-sm:shrink-0 pointer-coarse:h-10">
      <NameTooltip name={workspace.name} labelRef={labelRef}>
        <Link
          to={`/w/${workspace.id}/projects`}
          // Below 640 px only the icon shows, so the name is set as the label.
          aria-label={workspace.name}
          className={cn(
            'relative flex h-full max-w-[120px] min-w-0 items-center rounded-l-md bg-secondary/80 px-2.5 text-sm font-medium hover:bg-accent focus-visible:z-10 md:max-w-[200px]',
            FOCUS_OUTLINE_CLASSES,
          )}
        >
          <Building2 className="size-4 shrink-0 sm:hidden" aria-hidden="true" />
          <span ref={labelRef} className="hidden truncate sm:block">
            {workspace.name}
          </span>
        </Link>
      </NameTooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Switch workspace"
            className={cn(
              'relative flex h-full w-7 shrink-0 items-center justify-center rounded-r-md border-l border-border bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:z-10',
              FOCUS_OUTLINE_CLASSES,
            )}
          >
            <ChevronsUpDown className="size-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="bottom"
            align="start"
            sideOffset={6}
            aria-label="Switch workspace"
            className={cn(
              POPOVER_SHELL_CLASSES,
              'w-72 origin-(--radix-popover-content-transform-origin)',
            )}
          >
            <Command label="Search workspaces" filter={matchName} defaultValue={workspace.id}>
              <CommandInput placeholder="Search workspaces…" />
              <CommandList className="max-h-80 pt-1">
                <CommandEmpty>No workspaces found</CommandEmpty>
                {workspaces.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    keywords={[item.name]}
                    aria-current={item.id === workspace.id ? 'true' : undefined}
                    onSelect={() => select(item.id)}
                    className={OPTION_CLASSES}
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-brand-600 text-2xs font-semibold text-primary-foreground"
                    >
                      {Array.from(item.name.trim())[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span className="min-w-0 flex-1 truncate" title={item.name}>
                      {item.name}
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground">
                      {item.kind === 'personal' ? 'Personal' : 'Team'}
                    </span>
                    <Check
                      aria-hidden="true"
                      className={cn(
                        'size-3.5 shrink-0 text-link',
                        item.id !== workspace.id && 'invisible',
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </Popover>
    </div>
  );
}
