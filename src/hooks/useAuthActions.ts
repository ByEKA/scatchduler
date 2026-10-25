import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { useAuthService } from '@/data/DataLayerProvider';

export interface PasswordCredentials {
  email: string;
  password: string;
}

/** Signs in with email and password (P2 spec §5.4). The auth state listener does the rest. */
export function useSignInWithPassword(): UseMutationResult<void, unknown, PasswordCredentials> {
  const auth = useAuthService();
  return useMutation({
    mutationFn: ({ email, password }: PasswordCredentials) =>
      auth.signInWithPassword(email, password),
  });
}

/** "Continue with Google"; the variable is the `next` path to return to, or `null`. */
export function useSignInWithGoogle(): UseMutationResult<void, unknown, string | null> {
  const auth = useAuthService();
  return useMutation({
    mutationFn: (next: string | null) => auth.signInWithGoogle(next),
  });
}
