import { defaultFilter } from 'cmdk';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { OPTION_CLASSES, POPOVER_SHELL_CLASSES } from '@/components/common/popover-classes';
import {
  FOCUS_OUTLINE_CLASSES,
  NameTooltip,
  UnavailableSwitcher,
} from '@/components/layout/top-bar-parts';
import {
  Command,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import type { ID, ProjectSummary } from '@/data/types';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { cn } from '@/lib/utils';

// The list filters itself instead of letting cmdk do it: cmdk sorts matches by score and moves
// the matching items to the end of the list, which would put the footer above them. Here the
// projects keep their updatedAt order and the footer stays last.
function matching(projects: ProjectSummary[], search: string): ProjectSummary[] {
  if (search.trim() === '') return projects;
  return projects.filter((project) => defaultFilter(`${project.name} ${project.code}`, search) > 0);
}

/** The current project and a searchable list of the workspace's projects (spec §6.4, §6.7). */
export function ProjectSwitcher(): ReactElement {
  const { status, projects, project, setProject } = useCurrentContext();
  const { openDialog } = useDialogs();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  // Set while the footer hands focus to the new project dialog, so the closing popover doesn't
  // move focus back to the trigger after the dialog has taken it.
  const openingDialog = useRef(false);

  if (status === 'error') return <UnavailableSwitcher />;
  // Before the projects load, "Select project" would read as an empty workspace.
  if (status === 'loading') return <Skeleton className="h-7 w-24 shrink-0 sm:w-40" />;

  const handleOpenChange = (next: boolean) => {
    if (next) setSearch('');
    setOpen(next);
  };

  const select = (id: ID) => {
    setOpen(false);
    setProject(id);
  };

  const createProject = () => {
    openingDialog.current = true;
    setOpen(false);
    // The footer item unmounts with the popover; the dialog returns focus to whatever had focus
    // when it opened, so that has to be the trigger.
    triggerRef.current?.focus();
    openDialog('newProject');
  };

  const visible = matching(projects, search);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <NameTooltip name={project?.name ?? 'Select project'} labelRef={labelRef}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label="Switch project"
            className={cn(
              'flex h-7 max-w-[320px] min-w-14 items-center gap-1.5 rounded-md bg-secondary/80 px-2.5 text-sm font-medium hover:bg-accent',
              FOCUS_OUTLINE_CLASSES,
            )}
          >
            <span
              ref={labelRef}
              className={cn(
                'truncate max-sm:max-w-[120px]',
                project === null && 'text-muted-foreground',
              )}
            >
              {project?.name ?? 'Select project'}
            </span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </NameTooltip>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          aria-label="Switch project"
          onCloseAutoFocus={(event) => {
            if (!openingDialog.current) return;
            openingDialog.current = false;
            event.preventDefault();
          }}
          className={cn(
            POPOVER_SHELL_CLASSES,
            'w-[304px] origin-(--radix-popover-content-transform-origin)',
          )}
        >
          <Command label="Search projects" shouldFilter={false} defaultValue={project?.id}>
            <CommandInput placeholder="Search projects…" value={search} onValueChange={setSearch} />
            <CommandList className="max-h-80 pt-1">
              {visible.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.id}
                  aria-current={item.id === project?.id ? 'true' : undefined}
                  onSelect={() => select(item.id)}
                  className={cn(
                    OPTION_CLASSES,
                    item.id === project?.id && 'bg-accent text-accent-foreground',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs text-muted-foreground">
                    {item.code}
                  </span>
                  <Check
                    aria-hidden="true"
                    className={cn(
                      'size-3.5 shrink-0 text-link',
                      item.id !== project?.id && 'invisible',
                    )}
                  />
                </CommandItem>
              ))}
              {visible.length === 0 && search.trim() !== '' && (
                <div className="py-6 text-center text-sm">No projects found</div>
              )}
              {visible.length > 0 && <CommandSeparator alwaysRender className="my-1" />}
              <CommandItem
                value="create-new-project"
                onSelect={createProject}
                className={cn(OPTION_CLASSES, 'text-link data-[selected=true]:text-link')}
              >
                <Plus className="size-4 text-link" aria-hidden="true" />
                Create new project
              </CommandItem>
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}
