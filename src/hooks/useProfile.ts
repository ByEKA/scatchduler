import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useRepository } from '@/data/DataLayerProvider';
import type { User } from '@/data/types';
import { queryKeys } from '@/hooks/query-keys';

/**
 * Saves the signed-in user's name (P2 spec §6.3). It refreshes the current user and every member
 * list, and stays pending until they have refetched.
 */
export function useUpdateProfile(): UseMutationResult<
  User,
  unknown,
  { firstName: string; lastName: string }
> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { firstName: string; lastName: string }) => repository.updateProfile(input),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.membersAll() }),
      ]),
  });
}
