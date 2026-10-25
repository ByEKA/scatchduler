import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { NewProjectInput } from '@/data/repository';
import type { ID, Project, ProjectSummary } from '@/data/types';
import { queryKeys, RECENT_PROJECTS_LIMIT } from '@/hooks/query-keys';
import { prepareCoverImage } from '@/lib/image';

/** The Project ID format from spec §5.7; the availability check only runs for IDs that pass it. */
const PROJECT_CODE_FORMAT = /^[A-Za-z0-9_-]{1,16}$/;

/** The workspace's `RECENT_PROJECTS_LIMIT` latest projects; idle until `workspaceId` is set. */
export function useRecentProjects(workspaceId: ID | undefined): UseQueryResult<ProjectSummary[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.recentProjects(workspaceId),
    queryFn:
      workspaceId === undefined
        ? skipToken
        : () => repository.listRecentProjects(workspaceId, RECENT_PROJECTS_LIMIT),
  });
}

/** Every project of the workspace, latest first; idle until `workspaceId` is set. */
export function useWorkspaceProjects(
  workspaceId: ID | undefined,
): UseQueryResult<ProjectSummary[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.workspaceProjects(workspaceId),
    queryFn: workspaceId === undefined ? skipToken : () => repository.listProjects(workspaceId),
  });
}

/**
 * Whether `code` is free in the workspace. Stays idle while there is no workspace or the trimmed
 * code fails the format check. The caller debounces `code` (300 ms).
 */
export function useProjectCodeAvailable(
  workspaceId: ID | undefined,
  code: string,
): UseQueryResult<boolean> {
  const repository = useRepository();
  const trimmed = code.trim();
  return useQuery({
    queryKey: queryKeys.projectCode(workspaceId, trimmed.toLowerCase()),
    queryFn:
      workspaceId !== undefined && PROJECT_CODE_FORMAT.test(trimmed)
        ? () => repository.isProjectCodeAvailable(workspaceId, trimmed)
        : skipToken,
  });
}

export function useCreateProject(): UseMutationResult<Project, Error, NewProjectInput> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    // The cover photo is shrunk first, so both adapters store the smaller image (P2 spec §8.3).
    mutationFn: async (input: NewProjectInput) =>
      repository.createProject({
        ...input,
        coverImage: input.coverImage ? await prepareCoverImage(input.coverImage) : null,
      }),
    // Also after a failure: a conflict means the cached ID check for that code is out of date.
    // Returning the promise keeps the mutation pending until the lists have refetched.
    onSettled: (_project, _error, input) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projects(input.workspaceId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() }),
      ]),
  });
}
