import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { User } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

export function useCurrentUser(): UseQueryResult<User> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => repository.getCurrentUser(),
  });
}
