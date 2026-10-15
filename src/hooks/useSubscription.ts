import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { Subscription } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

export function useSubscription(): UseQueryResult<Subscription> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.subscription(),
    queryFn: () => repository.getSubscription(),
  });
}
