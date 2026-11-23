import {
  Calculator,
  ChartGantt,
  FileSpreadsheet,
  FolderKanban,
  Home,
  Library,
  Layers,
  Moon,
  Plus,
  Sun,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useDialogs } from '@/features/dialogs/DialogsProvider';
import {
  CommandPaletteContext,
  createSchedulePaletteStore,
  useCommandPalette,
  useSchedulePaletteRegistration,
} from '@/features/schedule/command-palette-context';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { useProjectSchedules } from '@/hooks/useProjectSchedules';
import { useTheme } from '@/hooks/useTheme';

const MAX_PALETTE_ACTIVITIES = 80;

export function CommandPalette(): ReactElement {
  const { open, setOpen } = useCommandPalette();
  const scheduleRegistration = useSchedulePaletteRegistration();
  const navigate = useNavigate();
  const { workspace, project } = useCurrentContext();
  const workspaceId = workspace?.id;
  const projectId = project?.id;
  const { openDialog } = useDialogs();
  const { theme, toggleTheme } = useTheme();
  const schedulesQuery = useProjectSchedules(projectId);

  const activeProjectSchedules = useMemo(
    () => (schedulesQuery.data ?? []).filter((s) => s.archivedAt === null),
    [schedulesQuery.data],
  );

  const runAndClose = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const activitiesToShow = useMemo(
    () => (scheduleRegistration?.activities ?? []).slice(0, MAX_PALETTE_ACTIVITIES),
    [scheduleRegistration?.activities],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search activities, WBS nodes or commands"
    >
      <CommandInput placeholder="Search activities, WBS or commands…" />
      <CommandList>
        <CommandEmpty>No matching results.</CommandEmpty>

        {scheduleRegistration !== null && scheduleRegistration.commands.length > 0 && (
          <>
            <CommandGroup heading="Schedule actions">
              {scheduleRegistration.commands.map((cmd) => (
                <CommandItem
                  key={cmd.id}
                  value={`command ${cmd.label}`}
                  disabled={cmd.disabled}
                  onSelect={() => runAndClose(() => cmd.onSelect())}
                >
                  <Calculator className="size-4" aria-hidden="true" />
                  <span>{cmd.label}</span>
                  {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {scheduleRegistration !== null && activitiesToShow.length > 0 && (
          <>
            <CommandGroup heading="Jump to activity">
              {activitiesToShow.map((act) => (
                <CommandItem
                  key={act.id}
                  value={`activity ${act.code} ${act.name}`}
                  onSelect={() => runAndClose(() => scheduleRegistration.onJumpToActivity(act.id))}
                >
                  <ChartGantt className="size-4" aria-hidden="true" />
                  <span className="font-mono text-xs text-muted-foreground">{act.code}</span>
                  <span className="truncate">{act.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {scheduleRegistration !== null && scheduleRegistration.wbs.length > 0 && (
          <>
            <CommandGroup heading="Jump to WBS">
              {scheduleRegistration.wbs.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`wbs ${node.code} ${node.name}`}
                  onSelect={() => runAndClose(() => scheduleRegistration.onSelectWbs(node.id))}
                >
                  <Layers className="size-4" aria-hidden="true" />
                  <span className="font-mono text-xs text-muted-foreground">{node.code}</span>
                  <span className="truncate">{node.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {workspaceId !== undefined &&
          projectId !== undefined &&
          activeProjectSchedules.length > 0 && (
            <>
              <CommandGroup heading="Switch schedule">
                {activeProjectSchedules.map((sched) => (
                  <CommandItem
                    key={sched.id}
                    value={`switch schedule ${sched.code ?? ''} ${sched.name}`}
                    onSelect={() =>
                      runAndClose(() =>
                        void navigate(`/w/${workspaceId}/p/${projectId}/schedule?s=${sched.id}`),
                      )
                    }
                  >
                    <FileSpreadsheet className="size-4" aria-hidden="true" />
                    {sched.code && (
                      <span className="font-mono text-xs text-muted-foreground">{sched.code}</span>
                    )}
                    <span className="truncate">{sched.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

        <CommandGroup heading="Navigation & actions">
          <CommandItem
            value="Go to Home"
            onSelect={() => runAndClose(() => void navigate('/home'))}
          >
            <Home className="size-4" aria-hidden="true" />
            <span>Go to Home</span>
          </CommandItem>
          <CommandItem
            value="Go to Library"
            onSelect={() => runAndClose(() => void navigate('/library'))}
          >
            <Library className="size-4" aria-hidden="true" />
            <span>Go to Library</span>
          </CommandItem>
          {workspaceId !== undefined && (
            <CommandItem
              value="Go to Projects"
              onSelect={() => runAndClose(() => void navigate(`/w/${workspaceId}/projects`))}
            >
              <FolderKanban className="size-4" aria-hidden="true" />
              <span>Go to Projects</span>
            </CommandItem>
          )}
          {workspaceId !== undefined && projectId !== undefined && (
            <>
              <CommandItem
                value="Go to Project files"
                onSelect={() =>
                  runAndClose(() => void navigate(`/w/${workspaceId}/p/${projectId}/files`))
                }
              >
                <FileSpreadsheet className="size-4" aria-hidden="true" />
                <span>Go to Project files</span>
              </CommandItem>
              <CommandItem
                value="Go to Schedule editor"
                onSelect={() =>
                  runAndClose(() => void navigate(`/w/${workspaceId}/p/${projectId}/schedule`))
                }
              >
                <ChartGantt className="size-4" aria-hidden="true" />
                <span>Go to Schedule editor</span>
              </CommandItem>
              <CommandItem
                value="New blank schedule"
                onSelect={() => runAndClose(() => openDialog('newSchedule', { projectId }))}
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>New blank schedule</span>
              </CommandItem>
              <CommandItem
                value="Import schedule"
                onSelect={() => runAndClose(() => openDialog('importSchedule', { projectId }))}
              >
                <Plus className="size-4" aria-hidden="true" />
                <span>Import schedule</span>
              </CommandItem>
            </>
          )}
          {workspaceId !== undefined && (
            <CommandItem
              value="New project"
              onSelect={() => runAndClose(() => openDialog('newProject', { workspaceId }))}
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>New project</span>
            </CommandItem>
          )}
          <CommandItem
            value={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onSelect={() => runAndClose(() => toggleTheme())}
          >
            {theme === 'dark' ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
            <span>{theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function CommandPaletteProvider({ children }: { children: ReactNode }): ReactElement {
  const [open, setOpen] = useState(false);
  const [store] = useState(createSchedulePaletteStore);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      toggle,
      store,
    }),
    [open, toggle, store],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {open && <CommandPalette />}
    </CommandPaletteContext.Provider>
  );
}
