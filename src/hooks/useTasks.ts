import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { ID, Task } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

export interface SetTaskDoneVariables {
  taskId: ID;
  done: boolean;
}

interface SetTaskDoneSnapshot {
  previous: Task[] | undefined;
}

export function usePendingTasks(): UseQueryResult<Task[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.pendingTasks(),
    queryFn: () => repository.listPendingTasks(),
  });
}

/**
 * Marking a task done removes it from the pending list at once; a failed write puts the list
 * back. Either way the list is refetched once the write settles.
 */
export function useSetTaskDone(): UseMutationResult<
  Task,
  Error,
  SetTaskDoneVariables,
  SetTaskDoneSnapshot
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, done }: SetTaskDoneVariables) => repository.setTaskDone(taskId, done),
    onMutate: async ({ taskId, done }): Promise<SetTaskDoneSnapshot> => {
      // A refetch that is already running would overwrite the optimistic list when it lands.
      await queryClient.cancelQueries({ queryKey: queryKeys.pendingTasks() });
      const previous = queryClient.getQueryData<Task[]>(queryKeys.pendingTasks());
      if (done && previous) {
        queryClient.setQueryData<Task[]>(
          queryKeys.pendingTasks(),
          previous.filter((task) => task.id !== taskId),
        );
      }
      return { previous };
    },
    onError: (_error, _variables, snapshot) => {
      if (snapshot?.previous) {
        queryClient.setQueryData<Task[]>(queryKeys.pendingTasks(), snapshot.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.pendingTasks() }),
  });
}
