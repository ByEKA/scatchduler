import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import type { EmailLinkType } from '@/data/auth';
import { useAuthService, useRepository } from '@/data/DataLayerProvider';
import { RepositoryError } from '@/data/errors';
import { queryKeys } from '@/hooks/query-keys';

export interface PasswordCredentials {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  tokenHash: string;
  password: string;
}

export interface AcceptInviteInput {
  tokenHash: string;
  firstName: string;
  lastName: string;
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

/** Sends a reset link; resolves whether or not the account exists (P2 spec §5.3). */
export function useRequestPasswordReset(): UseMutationResult<void, unknown, string> {
  const auth = useAuthService();
  return useMutation({
    mutationFn: (email: string) => auth.requestPasswordReset(email),
  });
}

/** Errors from verifying an email link that mean the link is expired or already used. */
const expiredLinkErrors = new WeakSet<object>();

/**
 * True when an email-link mutation failed because the link itself is expired or was already
 * used (a `validation` rejection from `verifyEmailLink`). The pages then show the expired card.
 */
export function isExpiredLinkError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && expiredLinkErrors.has(error);
}

/**
 * Verifies an email link at most once per token (P2 spec §5.2). The last verified token is kept
 * in a ref, so when a later step fails, a retry with the same token skips the verification: the
 * token is already used.
 */
function useVerifyEmailLinkOnce(): (tokenHash: string, type: EmailLinkType) => Promise<void> {
  const auth = useAuthService();
  const verifiedTokenRef = useRef<string | null>(null);
  return useCallback(
    async (tokenHash: string, type: EmailLinkType) => {
      if (verifiedTokenRef.current === tokenHash) return;
      try {
        await auth.verifyEmailLink(tokenHash, type);
      } catch (error) {
        if (error instanceof RepositoryError && error.code === 'validation') {
          expiredLinkErrors.add(error);
        }
        throw error;
      }
      verifiedTokenRef.current = tokenHash;
    },
    [auth],
  );
}

/** Reset-password page: verify the recovery link → set the new password (P2 spec §5.4). */
export function useResetPassword(): UseMutationResult<void, unknown, ResetPasswordInput> {
  const auth = useAuthService();
  const verifyOnce = useVerifyEmailLinkOnce();
  return useMutation({
    mutationFn: async ({ tokenHash, password }: ResetPasswordInput) => {
      await verifyOnce(tokenHash, 'recovery');
      await auth.updatePassword(password);
    },
  });
}

/**
 * Accept-invite page: verify the invite link → set the password → save the name, then refresh
 * `['me']` (P2 spec §5.4, §6.3).
 */
export function useAcceptInvite(): UseMutationResult<void, unknown, AcceptInviteInput> {
  const auth = useAuthService();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const verifyOnce = useVerifyEmailLinkOnce();
  return useMutation({
    mutationFn: async ({ tokenHash, firstName, lastName, password }: AcceptInviteInput) => {
      await verifyOnce(tokenHash, 'invite');
      await auth.updatePassword(password);
      await repository.updateProfile({ firstName, lastName });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.me() }),
  });
}

/**
 * Finishes the Google redirect described by `href`, once (P2 spec §5.5, §6.3). A query rather
 * than an effect, so StrictMode can't run it twice; it returns `true` because TanStack Query v5
 * rejects `undefined` data.
 */
export function useOAuthCallback(href: string): UseQueryResult<true> {
  const auth = useAuthService();
  return useQuery({
    queryKey: queryKeys.authCallback(href),
    queryFn: async () => {
      await auth.completeOAuthSignIn(href);
      return true as const;
    },
    retry: false,
    staleTime: Infinity,
  });
}
