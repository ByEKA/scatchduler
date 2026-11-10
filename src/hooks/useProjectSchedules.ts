import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { ID, Schedule } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

/** The project's schedules, archived included, in `listSchedules` order; idle until `projectId` is set. */
export function useProjectSchedules(projectId: ID | undefined): UseQueryResult<Schedule[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.projectSchedules(projectId),
    queryFn: projectId === undefined ? skipToken : () => repository.listSchedules(projectId),
  });
}
