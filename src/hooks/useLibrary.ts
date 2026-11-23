import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { LibraryData } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

/** Cross-workspace schedule library data across all member workspaces and shared schedules (R7). */
export function useLibraryData(): UseQueryResult<LibraryData> {
  const repository = useRepository();
  return useQuery({
    queryKey: queryKeys.library(),
    queryFn: () => repository.getLibraryData(),
  });
}
