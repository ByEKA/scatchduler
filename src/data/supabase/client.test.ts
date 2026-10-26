import { expect, it, vi } from 'vitest';
import {
  createStorageAdapter,
  REQUEST_TIMEOUT_MS,
  withRequestTimeout,
} from '@/data/supabase/client';
import { createMemoryStorage } from '@/lib/storage';

// Never answers; like the real fetch, it rejects with the signal's reason once the signal aborts.
const hangingFetch: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init?.signal?.reason));
  });

it('keeps the session in memory when browser storage is blocked', () => {
  const storage = createStorageAdapter(null);
  storage.setItem('sb-auth', 'token');
  expect(storage.getItem('sb-auth')).toBe('token');
  storage.removeItem('sb-auth');
  expect(storage.getItem('sb-auth')).toBeNull();
});

it('writes through to browser storage when it exists', () => {
  const memory = createMemoryStorage();
  createStorageAdapter(memory).setItem('k', 'v');
  expect(memory.getItem('k')).toBe('v');
});

it('aborts a request that has not answered after 60 seconds', async () => {
  expect(REQUEST_TIMEOUT_MS).toBe(60_000);
  vi.useFakeTimers();
  try {
    let settled = false;
    const request = withRequestTimeout(
      hangingFetch,
      REQUEST_TIMEOUT_MS,
    )('https://example.test/rest/v1/projects');
    request
      .catch(() => undefined)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
  } finally {
    vi.useRealTimers();
  }
});

it('still lets the caller abort a request', async () => {
  const controller = new AbortController();
  const request = withRequestTimeout(hangingFetch, REQUEST_TIMEOUT_MS)(
    'https://example.test/rest/v1/projects',
    { signal: controller.signal },
  );
  controller.abort(new DOMException('Cancelled', 'AbortError'));
  await expect(request).rejects.toMatchObject({ name: 'AbortError' });
});

it('keeps forwarding the caller abort after the response arrives', async () => {
  let innerSignal: AbortSignal | undefined;
  const answeringFetch: typeof fetch = (_input, init) => {
    innerSignal = init?.signal ?? undefined;
    return Promise.resolve(new Response('body'));
  };
  const controller = new AbortController();
  await withRequestTimeout(answeringFetch, REQUEST_TIMEOUT_MS)('https://example.test/storage', {
    signal: controller.signal,
  });
  expect(innerSignal?.aborted).toBe(false);
  controller.abort();
  expect(innerSignal?.aborted).toBe(true);
});
