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
import type { Folder, ID } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

function refreshAfterFolderWrite(queryClient: QueryClient, touchSchedules = false): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allFolders() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.library() }),
    ...(touchSchedules
      ? [queryClient.invalidateQueries({ queryKey: queryKeys.allSchedules() })]
      : []),
  ]);
}

/** The project's folders sorted alphabetically (R3); idle until `projectId` is set. */
export function useProjectFolders(projectId: ID | undefined): UseQueryResult<Folder[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.folders(projectId),
    queryFn: projectId === undefined ? skipToken : () => repository.listFolders(projectId),
  });
}

export function useCreateFolder(): UseMutationResult<
  Folder,
  Error,
  { projectId: ID; parentId?: ID | null; name: string }
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: ID; parentId?: ID | null; name: string }) =>
      repository.createFolder(input),
    onSettled: () => refreshAfterFolderWrite(queryClient),
  });
}

export function useRenameFolder(): UseMutationResult<
  Folder,
  Error,
  { folderId: ID; name: string }
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { folderId: ID; name: string }) => repository.renameFolder(input),
    onSettled: () => refreshAfterFolderWrite(queryClient),
  });
}

export function useDeleteFolder(): UseMutationResult<void, Error, ID> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (folderId: ID) => repository.deleteFolder(folderId),
    onSettled: () => refreshAfterFolderWrite(queryClient, true),
  });
}
