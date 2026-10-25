import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { ID, InviteResult, Role, WorkspaceInvitation, WorkspaceMember } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

// Member and invitation hooks (P2 spec §6.3). Each mutation returns its invalidation from
// `onSettled`, so it stays pending until the lists it changed have refetched.

/** The workspace's members in the repository's order (owners, editors, viewers; then by name). */
export function useWorkspaceMembers(workspaceId: ID): UseQueryResult<WorkspaceMember[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: () => repository.listMembers(workspaceId),
  });
}

/** Pending invitations, newest first. Only owners see them, so callers enable it for owners. */
export function useWorkspaceInvitations(
  workspaceId: ID,
  enabled: boolean,
): UseQueryResult<WorkspaceInvitation[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.invitations(workspaceId),
    queryFn: () => repository.listInvitations(workspaceId),
    enabled,
  });
}

/**
 * Invites someone, or sends a pending invitation again. It refreshes members and invitations
 * after a failure too: a failed email still leaves a pending invitation.
 */
export function useInviteMember(
  workspaceId: ID,
): UseMutationResult<InviteResult, unknown, { email: string; role: Role }> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: Role }) =>
      repository.inviteMember({ workspaceId, email, role }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations(workspaceId) }),
      ]),
  });
}

export function useRevokeInvitation(workspaceId: ID): UseMutationResult<void, unknown, ID> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: ID) => repository.revokeInvitation(invitationId),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations(workspaceId) }),
  });
}

/** Members and the workspace list both refresh: the caller's own role may have changed. */
function useMembershipChange<TInput>(
  workspaceId: ID,
  mutationFn: (input: TInput) => Promise<void>,
): UseMutationResult<void, unknown, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() }),
      ]),
  });
}

export function useUpdateMemberRole(
  workspaceId: ID,
): UseMutationResult<void, unknown, { userId: ID; role: Role }> {
  const repository = useRepository();
  return useMembershipChange(workspaceId, ({ userId, role }: { userId: ID; role: Role }) =>
    repository.updateMemberRole({ workspaceId, userId, role }),
  );
}

export function useRemoveMember(workspaceId: ID): UseMutationResult<void, unknown, { userId: ID }> {
  const repository = useRepository();
  return useMembershipChange(workspaceId, ({ userId }: { userId: ID }) =>
    repository.removeMember({ workspaceId, userId }),
  );
}
