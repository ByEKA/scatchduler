import type { ID } from '@/data/types';

/** How many projects Home lists under Recent projects. */
export const RECENT_PROJECTS_LIMIT = 5;

// The only place query keys are built (spec §5.5). Every project key starts with
// ['projects', workspaceId], so invalidating that prefix refreshes both project lists and the
// Project ID checks of one workspace. A `workspaceId` of `undefined` only appears in the key of a
// query that is disabled until a workspace is known.
export const queryKeys = {
  /** Prefix of the auth queries; they survive a change of user (P2 spec §5.4). */
  auth: () => ['auth'] as const,
  /** The `/auth/callback` exchange for one callback URL (P2 spec §6.3). */
  authCallback: (href: string) => ['auth', 'callback', href] as const,
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
  /** One project with its summary (P3 core spec §4.4). */
  project: (workspaceId: ID | undefined, projectId: ID | undefined) =>
    ['projects', workspaceId, 'detail', projectId] as const,
  /** The members of one workspace (P2 spec §6.3). */
  members: (workspaceId: ID) => ['members', workspaceId] as const,
  /** Prefix of every member query; a profile change refreshes them all. */
  membersAll: () => ['members'] as const,
  /** The pending invitations of one workspace. */
  invitations: (workspaceId: ID) => ['invitations', workspaceId] as const,
  sharedWithMe: () => ['shared-with-me'] as const,
  pendingTasks: () => ['tasks', 'pending'] as const,
};
