import type { Role } from '@/data/types';

/** Every role, from the most to the least access (P2 spec §5.8). */
export const ROLES = ['owner', 'editor', 'viewer'] as const satisfies readonly Role[];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: 'Manages members and settings',
  editor: 'Creates and edits projects and schedules',
  viewer: 'Can view everything but change nothing',
};

/**
 * Owners and editors may change a workspace's projects and schedules. While the workspace is
 * still unknown this answers true; row-level security decides on the server either way.
 */
export function canEdit(workspace: { myRole: Role } | null | undefined): boolean {
  return workspace == null || workspace.myRole !== 'viewer';
}

/** Only owners manage members and invitations. */
export function isOwner(workspace: { myRole: Role } | null | undefined): boolean {
  return workspace?.myRole === 'owner';
}

/** The Tooltip of every write button a viewer can't use (P2 spec §5.9, P3 core spec §6.1). */
export const VIEWER_HINT = "Viewers can't make changes in this workspace";
