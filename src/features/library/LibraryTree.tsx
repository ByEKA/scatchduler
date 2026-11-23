import {
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder as FolderIcon,
  Library,
  Lock,
  Share2,
  User,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common/EmptyState';
import { TABLE_HEADER_CELL_CLASSES } from '@/components/common/table-classes';
import { TagBadges } from '@/components/common/TagBadges';
import { FOCUS_OUTLINE_CLASSES } from '@/components/layout/top-bar-parts';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ID, Schedule } from '@/data/types';
import type { LibraryGroupsResult } from '@/features/library/library-list';
import { useNow } from '@/hooks/useNow';
import { fullName, relativeTime, shortDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const CELL_CLASSES = 'px-3 py-2.5 whitespace-nowrap first:pl-4 last:pr-4';
const ARCHIVED_BADGE_CLASSES =
  'inline-flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 text-xs font-medium whitespace-nowrap text-muted-foreground';
const FOLDER_BADGE_CLASSES =
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm bg-muted/70 px-1.5 text-2xs font-medium text-muted-foreground';

function sourceLabel(schedule: Schedule): string {
  if (schedule.source === 'blank') return 'Blank';
  return schedule.sourceFileName === null ? 'Imported' : `Imported · ${schedule.sourceFileName}`;
}

/**
 * Grouped cross-workspace schedule browser (spec §7.1):
 * Workspace -> Project -> Schedules table, plus a "Shared with me" section when shared schedules match.
 */
export function LibraryTree({
  groups,
  hasActiveFilters,
  onClearFilters,
}: {
  groups: LibraryGroupsResult;
  hasActiveFilters: boolean;
  onClearFilters(): void;
}): ReactElement {
  const now = useNow(60_000);
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<ReadonlySet<ID>>(() => new Set());

  const toggleWorkspace = (workspaceId: ID) => {
    setCollapsedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  };

  if (groups.workspaceGroups.length === 0 && groups.sharedSchedules.length === 0) {
    return (
      <div className="rounded-lg bg-card py-12 ring-1 ring-edge">
        <EmptyState
          icon={Library}
          title={hasActiveFilters ? 'No matching schedules' : 'No schedules yet'}
          description={
            hasActiveFilters
              ? 'Try clearing or adjusting your library search and filters.'
              : 'Schedules you create or import across your workspaces will appear here.'
          }
          action={
            hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.workspaceGroups.map(({ workspace, projects, scheduleCount }) => {
        const isCollapsed = collapsedWorkspaces.has(workspace.id);
        return (
          <section
            key={workspace.id}
            aria-label={workspace.name}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                onClick={() => toggleWorkspace(workspace.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:text-foreground',
                  FOCUS_OUTLINE_CLASSES,
                )}
              >
                {isCollapsed ? (
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                {workspace.kind === 'personal' ? (
                  <User className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <h2 className="text-sm font-semibold">{workspace.name}</h2>
                <span className="rounded-sm bg-muted px-1.5 py-px text-2xs font-medium text-muted-foreground capitalize">
                  {workspace.kind}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {scheduleCount}
                </span>
              </button>
              <Link
                to={`/w/${workspace.id}/projects`}
                className={cn(
                  'rounded-sm text-xs font-medium text-link hover:underline',
                  FOCUS_OUTLINE_CLASSES,
                )}
              >
                View projects
              </Link>
            </div>

            {!isCollapsed && (
              <div className="flex flex-col gap-4">
                {projects.map(({ project, schedules }) => (
                  <div
                    key={project.id}
                    className="overflow-hidden rounded-lg bg-card ring-1 ring-edge"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          to={`/w/${workspace.id}/p/${project.id}/files`}
                          className={cn(
                            'truncate rounded-sm text-sm font-semibold hover:underline',
                            FOCUS_OUTLINE_CLASSES,
                          )}
                        >
                          {project.name}
                        </Link>
                        <span className="shrink-0 rounded-sm bg-muted px-1.5 py-px font-mono text-2xs font-medium text-muted-foreground">
                          {project.code}
                        </span>
                      </div>
                      <Link
                        to={`/w/${workspace.id}/p/${project.id}/files`}
                        className={cn(
                          'rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground hover:underline',
                          FOCUS_OUTLINE_CLASSES,
                        )}
                      >
                        Project files
                      </Link>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <caption className="sr-only">{`Schedules in ${project.name}`}</caption>
                        <thead>
                          <tr className="h-9 border-b bg-muted/20">
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'w-full')}>
                              Name
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'hidden md:table-cell')}>
                              Code
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES)}>
                              Tags
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES)}>
                              Status date
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'hidden lg:table-cell')}>
                              Activities
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'hidden lg:table-cell')}>
                              Source
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'hidden md:table-cell')}>
                              Last modified
                            </th>
                            <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES)}>
                              <span className="sr-only">Open</span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedules.map(({ schedule, folderName }) => {
                            const href = `/w/${workspace.id}/p/${project.id}/schedule?scheduleId=${schedule.id}`;
                            const lockLabel =
                              schedule.lock === null
                                ? null
                                : `Being edited by ${schedule.lock.userName}`;
                            return (
                              <tr
                                key={schedule.id}
                                className={cn(
                                  'border-b text-sm last:border-b-0 hover:bg-accent/30',
                                  schedule.archivedAt !== null && 'text-muted-foreground',
                                )}
                              >
                                <td className={CELL_CLASSES}>
                                  <div className="flex min-w-0 items-center gap-2">
                                    <Link
                                      to={href}
                                      className={cn(
                                        'max-w-80 truncate rounded-sm font-medium hover:underline',
                                        FOCUS_OUTLINE_CLASSES,
                                      )}
                                    >
                                      {schedule.name}
                                    </Link>
                                    {folderName !== null && (
                                      <span className={FOLDER_BADGE_CLASSES}>
                                        <FolderIcon className="size-3" aria-hidden="true" />
                                        <span className="max-w-32 truncate">{folderName}</span>
                                      </span>
                                    )}
                                    {lockLabel !== null && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span
                                            role="img"
                                            aria-label={lockLabel}
                                            className="inline-flex shrink-0 items-center text-warning-foreground"
                                          >
                                            <Lock className="size-3.5" aria-hidden="true" />
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent sideOffset={6}>{lockLabel}</TooltipContent>
                                      </Tooltip>
                                    )}
                                    {schedule.archivedAt !== null && (
                                      <span className={ARCHIVED_BADGE_CLASSES}>Archived</span>
                                    )}
                                  </div>
                                </td>
                                <td className={cn(CELL_CLASSES, 'hidden font-mono text-xs md:table-cell')}>
                                  {schedule.code ?? '—'}
                                </td>
                                <td className={CELL_CLASSES}>
                                  {schedule.isCurrent || schedule.baseline !== 'none' ? (
                                    <TagBadges schedule={schedule} />
                                  ) : (
                                    '—'
                                  )}
                                </td>
                                <td className={CELL_CLASSES}>{shortDate(schedule.statusDate)}</td>
                                <td className={cn(CELL_CLASSES, 'hidden tabular-nums lg:table-cell')}>
                                  {schedule.activityCount.toLocaleString('en-US')}
                                </td>
                                <td className={cn(CELL_CLASSES, 'hidden lg:table-cell')}>
                                  <span className="block max-w-48 truncate">
                                    {sourceLabel(schedule)}
                                  </span>
                                </td>
                                <td className={cn(CELL_CLASSES, 'hidden md:table-cell')}>
                                  {relativeTime(schedule.updatedAt, now)}
                                </td>
                                <td className={CELL_CLASSES}>
                                  <Button asChild variant="outline" size="xs" className="border-input bg-card dark:bg-card">
                                    <Link to={href}>
                                      Open
                                      <ExternalLink className="size-3" aria-hidden="true" />
                                    </Link>
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {groups.sharedSchedules.length > 0 && (
        <section aria-label="Shared with me" className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Share2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Shared with me</h2>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {groups.sharedSchedules.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg bg-card ring-1 ring-edge">
            <table className="w-full">
              <caption className="sr-only">Shared schedules</caption>
              <thead>
                <tr className="h-9 border-b bg-muted/40">
                  <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'w-full')}>
                    Name
                  </th>
                  <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES)}>
                    Project
                  </th>
                  <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES)}>
                    Status date
                  </th>
                  <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES, 'hidden md:table-cell')}>
                    Shared by
                  </th>
                  <th scope="col" className={cn(TABLE_HEADER_CELL_CLASSES, CELL_CLASSES)}>
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.sharedSchedules.map((row) => {
                  const href = `/w/${row.workspaceId}/p/${row.projectId}/schedule?scheduleId=${row.scheduleId}`;
                  return (
                    <tr key={row.shareId} className="border-b text-sm last:border-b-0 hover:bg-accent/30">
                      <td className={CELL_CLASSES}>
                        <Link
                          to={href}
                          className={cn(
                            'max-w-80 truncate rounded-sm font-medium hover:underline',
                            FOCUS_OUTLINE_CLASSES,
                          )}
                        >
                          {row.scheduleName}
                        </Link>
                      </td>
                      <td className={CELL_CLASSES}>{row.projectName}</td>
                      <td className={CELL_CLASSES}>{shortDate(row.statusDate)}</td>
                      <td className={cn(CELL_CLASSES, 'hidden md:table-cell')}>
                        {fullName(row.sharedBy)}
                      </td>
                      <td className={CELL_CLASSES}>
                        <Button asChild variant="outline" size="xs" className="border-input bg-card dark:bg-card">
                          <Link to={href}>
                            Open
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
