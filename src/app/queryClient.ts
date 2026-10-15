import { QueryClient } from '@tanstack/react-query';

/**
 * The app's QueryClient (spec §4.3). Mutations keep TanStack's default of no retries, so a failed
 * create is never sent twice. `{ test: true }` turns query retries off as well, so a failing read
 * shows its error state at once.
 */
export function createQueryClient(options: { test?: boolean } = {}): QueryClient {
  const test = options.test ?? false;
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: test ? false : 1,
        refetchOnWindowFocus: false,
      },
      mutations: test ? { retry: false } : {},
    },
  });
}
