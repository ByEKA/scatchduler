import {
  Boxes,
  ChartColumn,
  ChartGantt,
  FolderKanban,
  FolderOpen,
  House,
  LibraryBig,
  type LucideIcon,
} from 'lucide-react';
import { useId } from 'react';
import type { ReactElement } from 'react';
import { NavLink } from 'react-router';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentContext } from '@/hooks/useCurrentContext';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  icon: LucideIcon;
  /** `null` renders the item disabled. */
  to: string | null;
  /** Tooltip on the disabled item. */
  disabledHint?: string;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const NO_PROJECT_HINT = 'Create or select a project first';

// Spec §6.5. Focus uses an outline because the active item's inset ring is a box-shadow.
const ITEM_CLASSES =
  'flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:h-10';

function navGroups(workspaceId: string | null, projectId: string | null): NavGroup[] {
  const projectPath = (section: string) =>
    workspaceId !== null && projectId !== null
      ? `/w/${workspaceId}/p/${projectId}/${section}`
      : null;
  return [
    {
      label: null,
      items: [
        { label: 'Home', icon: House, to: '/home' },
        { label: 'Library', icon: LibraryBig, to: '/library' },
        { label: 'Assets', icon: Boxes, to: '/assets' },
      ],
    },
    {
      label: 'Workspace',
      items: [
        {
          label: 'Projects',
          icon: FolderKanban,
          to: workspaceId !== null ? `/w/${workspaceId}/projects` : null,
        },
      ],
    },
    {
      label: 'Project',
      items: [
        {
          label: 'Files',
          icon: FolderOpen,
          to: projectPath('files'),
          disabledHint: NO_PROJECT_HINT,
        },
        {
          label: 'Dashboard',
          icon: ChartColumn,
          to: projectPath('dashboard'),
          disabledHint: NO_PROJECT_HINT,
        },
        {
          label: 'Schedule',
          icon: ChartGantt,
          to: projectPath('schedule'),
          disabledHint: NO_PROJECT_HINT,
        },
      ],
    },
  ];
}

function NavItemContent({ item }: { item: NavItem }): ReactElement {
  const Icon = item.icon;
  return (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </>
  );
}

function DisabledNavItem({ item }: { item: NavItem }): ReactElement {
  // The text is dimmed through its color rather than `opacity`, which would also dim the focus
  // outline below 3:1.
  const span = (
    <span
      // Focusable so keyboard users reach the tooltip that explains why the item is disabled.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-disabled="true"
      className={cn(ITEM_CLASSES, 'cursor-not-allowed text-sidebar-foreground/50')}
    >
      <NavItemContent item={item} />
    </span>
  );
  if (item.disabledHint === undefined) return span;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{span}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={6}>
        {item.disabledHint}
      </TooltipContent>
    </Tooltip>
  );
}

function NavGroupList({
  group,
  onNavigate,
}: {
  group: NavGroup;
  onNavigate?: () => void;
}): ReactElement {
  const labelId = useId();
  return (
    <>
      {group.label !== null && (
        <p
          id={labelId}
          className="mt-3 mb-1.5 px-2 text-2xs font-medium tracking-[0.06em] text-subtle-foreground uppercase"
        >
          {group.label}
        </p>
      )}
      <ul
        className="flex flex-col gap-0.5"
        aria-labelledby={group.label !== null ? labelId : undefined}
      >
        {group.items.map((item) => (
          <li key={item.label}>
            {item.to === null ? (
              <DisabledNavItem item={item} />
            ) : (
              <NavLink
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    ITEM_CLASSES,
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-brand-500/35 ring-inset'
                      : 'text-sidebar-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <NavItemContent item={item} />
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The primary navigation (spec §6.5); rendered by the inline sidebar and the drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }): ReactElement {
  const { workspace, project } = useCurrentContext();
  const groups = navGroups(workspace?.id ?? null, project?.id ?? null);
  return (
    <nav aria-label="Primary">
      {groups.map((group) => (
        <NavGroupList key={group.label ?? 'main'} group={group} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
