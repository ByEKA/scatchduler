import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { ID, Program } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

function refreshAfterProgramWrite(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allPrograms() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.library() }),
  ]);
}

/** The workspace's programs sorted alphabetically (R1); idle until `workspaceId` is set. */
export function useWorkspacePrograms(workspaceId: ID | undefined): UseQueryResult<Program[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.programs(workspaceId),
    queryFn: workspaceId === undefined ? skipToken : () => repository.listPrograms(workspaceId),
  });
}

export function useCreateProgram(): UseMutationResult<
  Program,
  Error,
  { workspaceId: ID; name: string }
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { workspaceId: ID; name: string }) => repository.createProgram(input),
    onSettled: () => refreshAfterProgramWrite(queryClient),
  });
}

export function useRenameProgram(): UseMutationResult<
  Program,
  Error,
  { programId: ID; name: string }
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { programId: ID; name: string }) => repository.renameProgram(input),
    onSettled: () => refreshAfterProgramWrite(queryClient),
  });
}

export function useDeleteProgram(): UseMutationResult<void, Error, ID> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (programId: ID) => repository.deleteProgram(programId),
    onSettled: () => refreshAfterProgramWrite(queryClient),
  });
}
