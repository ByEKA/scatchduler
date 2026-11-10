import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type {
  ImportScheduleInput,
  NewScheduleInput,
  UpdateScheduleDetailsInput,
} from '@/data/repository';
import type { ID, Schedule } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

/**
 * Run on settle by every schedule mutation (P3 core spec §4.4). A schedule write can change the
 * schedule lists, its project's `updatedAt`, counts, current schedule and status date, and the
 * rows shared with me. The inputs name no workspace, so the prefixes cover every project and
 * schedule query. Also after a failure: a conflict means the cached list is out of date. Returning
 * the promise keeps the mutation pending until the queries have refetched.
 */
function refreshAfterScheduleWrite(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.allSchedules() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.allProjects() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.sharedWithMe() }),
  ]);
}

export function useCreateSchedule(): UseMutationResult<Schedule, Error, NewScheduleInput> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewScheduleInput) => repository.createSchedule(input),
    onSettled: () => refreshAfterScheduleWrite(queryClient),
  });
}

export function useImportSchedule(): UseMutationResult<Schedule, Error, ImportScheduleInput> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportScheduleInput) => repository.importSchedule(input),
    onSettled: () => refreshAfterScheduleWrite(queryClient),
  });
}

/** Saves the Schedule details dialog (R5–R8, R11). */
export function useUpdateScheduleDetails(): UseMutationResult<
  Schedule,
  Error,
  UpdateScheduleDetailsInput
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateScheduleDetailsInput) => repository.updateScheduleDetails(input),
    onSettled: () => refreshAfterScheduleWrite(queryClient),
  });
}

/** Makes the schedule its project's current one (R1, R4, R6). */
export function useSetCurrentSchedule(): UseMutationResult<void, Error, ID> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduleId: ID) => repository.setCurrentSchedule(scheduleId),
    onSettled: () => refreshAfterScheduleWrite(queryClient),
  });
}

/** Archives or restores schedules of one project (R2, R9, R11). */
export function useSetSchedulesArchived(): UseMutationResult<
  void,
  Error,
  { scheduleIds: ID[]; archived: boolean }
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { scheduleIds: ID[]; archived: boolean }) =>
      repository.setSchedulesArchived(input),
    onSettled: () => refreshAfterScheduleWrite(queryClient),
  });
}

/** Deletes schedules of one project with their stored originals (owners; R3, R9). */
export function useDeleteSchedules(): UseMutationResult<void, Error, ID[]> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scheduleIds: ID[]) => repository.deleteSchedules(scheduleIds),
    onSettled: () => refreshAfterScheduleWrite(queryClient),
  });
}
