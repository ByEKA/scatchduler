import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { ImportScheduleInput, NewScheduleInput } from '@/data/repository';
import type { Schedule } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

// A new schedule changes its project's `updatedAt` and `scheduleCount`. The input names only the
// project, not its workspace, so both hooks refresh project queries in every workspace.

export function useCreateSchedule(): UseMutationResult<Schedule, Error, NewScheduleInput> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewScheduleInput) => repository.createSchedule(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() }),
  });
}

export function useImportSchedule(): UseMutationResult<Schedule, Error, ImportScheduleInput> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportScheduleInput) => repository.importSchedule(input),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() }),
  });
}
