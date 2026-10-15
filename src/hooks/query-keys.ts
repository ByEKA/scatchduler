import type { ID } from '@/data/types';

/** How many projects Home lists under Recent projects. */
export const RECENT_PROJECTS_LIMIT = 5;

// The only place query keys are built (spec §5.5). Every project key starts with
// ['projects', workspaceId], so invalidating that prefix refreshes both project lists and the
// Project ID checks of one workspace. A `workspaceId` of `undefined` only appears in the key of a
// query that is disabled until a workspace is known.
export const queryKeys = {
  me: () => ['me'] as const,
  subscription: () => ['subscription'] as const,
  workspaces: () => ['workspaces'] as const,
  /** Prefix of every project query in every workspace. */
  allProjects: () => ['projects'] as const,
  /** Prefix of every project query in one workspace. */
  projects: (workspaceId: ID) => ['projects', workspaceId] as const,
  recentProjects: (workspaceId: ID | undefined) => ['projects', workspaceId, 'recent'] as const,
  workspaceProjects: (workspaceId: ID | undefined) => ['projects', workspaceId, 'all'] as const,
  /** `code` is the trimmed, lower-cased Project ID, the form the repository compares. */
  projectCode: (workspaceId: ID | undefined, code: string) =>
    ['projects', workspaceId, 'code', code] as const,
  sharedWithMe: () => ['shared-with-me'] as const,
  pendingTasks: () => ['tasks', 'pending'] as const,
};
