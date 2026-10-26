import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/data/supabase/database.types';
import { createMemoryStorage, readKey, removeKey, writeKey, type StorageLike } from '@/lib/storage';

export type AppSupabaseClient = SupabaseClient<Database>;

/** P2 spec D18: a request that hasn't answered after this long is aborted and surfaces as `network`. */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * The session store supabase-js uses (P2 spec D10). It goes through `src/lib/storage.ts`, and when
 * browser storage is blocked it keeps the session in memory, so sign-in lasts for the page's
 * lifetime instead of vanishing on every call.
 */
export function createStorageAdapter(storage: StorageLike | null): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const target = storage ?? createMemoryStorage();
  return {
    getItem: (key) => readKey(key, target),
    setItem: (key, value) => writeKey(key, value, target),
    removeItem: (key) => removeKey(key, target),
  };
}

/**
 * Wraps `fetchImpl` so a request that hasn't answered after `timeoutMs` rejects with a
 * `DOMException` named `TimeoutError`. The caller's own signal still aborts the request (and its
 * response body), and the timer is cleared once the request settles.
 */
export function withRequestTimeout(fetchImpl: typeof fetch, timeoutMs: number): typeof fetch {
  return (input, init) => {
    const controller = new AbortController();
    const callerSignal =
      init?.signal ??
      (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null);
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) onCallerAbort();
    else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new DOMException('The request timed out.', 'TimeoutError')),
      timeoutMs,
    );
    // A plain call: browsers throw "Illegal invocation" when fetch runs as another object's method.
    const baseFetch = fetchImpl;
    // Once the headers arrive the timer stops, but the caller's abort stays forwarded so it can
    // still cancel a response body that is being read.
    return baseFetch(input, { ...init, signal: controller.signal }).then(
      (response) => {
        clearTimeout(timer);
        return response;
      },
      (error: unknown) => {
        clearTimeout(timer);
        callerSignal?.removeEventListener('abort', onCallerAbort);
        throw error;
      },
    );
  };
}

/** One client per data layer; the repository and the auth service share it (P2 spec §8.1). */
export function createSupabaseClient(config: {
  url: string;
  publishableKey: string;
  storage: StorageLike | null;
}): AppSupabaseClient {
  return createClient<Database>(config.url, config.publishableKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      autoRefreshToken: true,
      persistSession: true,
      storage: createStorageAdapter(config.storage),
    },
    global: { fetch: withRequestTimeout(fetch, REQUEST_TIMEOUT_MS) },
  });
}
