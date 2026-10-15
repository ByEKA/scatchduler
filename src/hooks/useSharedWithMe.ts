import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { SharedScheduleRow } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

export function useSharedWithMe(): UseQueryResult<SharedScheduleRow[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.sharedWithMe(),
    queryFn: () => repository.listSharedWithMe(),
  });
}
