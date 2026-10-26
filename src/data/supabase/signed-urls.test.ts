import { expect, it, vi } from 'vitest';
import { createSignedUrlCache } from '@/data/supabase/signed-urls';

it('signs missing paths in one batch and reuses URLs that are still fresh', async () => {
  let now = 0;
  const sign = vi.fn(async (_bucket: string, paths: string[]) =>
    paths.map((path) => ({ path, signedUrl: `https://s/${path}?t=${now}` })),
  );
  const cache = createSignedUrlCache(sign, () => now);
  expect([...(await cache.urlsFor('project-covers', ['a', 'b'])).values()]).toEqual([
    'https://s/a?t=0',
    'https://s/b?t=0',
  ]);
  now = 49 * 60_000;
  await cache.urlsFor('project-covers', ['a', 'b', 'c']);
  expect(sign).toHaveBeenLastCalledWith('project-covers', ['c'], 3600);
  now = 51 * 60_000;
  expect((await cache.urlsFor('project-covers', ['a'])).get('a')).toBe(
    `https://s/a?t=${51 * 60_000}`,
  );
  expect(sign).toHaveBeenCalledTimes(3);
});

it('signs a path once when two callers ask for it at the same time', async () => {
  const sign = vi.fn(async (_bucket: string, paths: string[]) =>
    paths.map((path) => ({ path, signedUrl: `https://s/${path}` })),
  );
  const cache = createSignedUrlCache(sign, () => 0);
  const [first, second] = await Promise.all([
    cache.urlsFor('project-covers', ['a']),
    cache.urlsFor('project-covers', ['a', 'b']),
  ]);
  expect(first.get('a')).toBe('https://s/a');
  expect([...second.entries()]).toEqual([
    ['a', 'https://s/a'],
    ['b', 'https://s/b'],
  ]);
  expect(sign).toHaveBeenCalledTimes(2);
  expect(sign).toHaveBeenLastCalledWith('project-covers', ['b'], 3600);
});
