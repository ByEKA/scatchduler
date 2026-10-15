import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { NewTeamWorkspaceInput } from '@/data/repository';
import type { Workspace, WorkspaceSummary } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

export function useWorkspaces(): UseQueryResult<WorkspaceSummary[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.workspaces(),
    queryFn: () => repository.listWorkspaces(),
  });
}

export function useCreateTeamWorkspace(): UseMutationResult<
  Workspace,
  Error,
  NewTeamWorkspaceInput
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewTeamWorkspaceInput) => repository.createTeamWorkspace(input),
    // Returning the promise keeps the mutation pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.workspaces() }),
  });
}
