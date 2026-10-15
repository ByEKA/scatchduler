import { expect, it } from 'vitest';
import { coverFor, fnv1a } from '@/lib/cover';

it('implements 32-bit FNV-1a', () => {
  expect(fnv1a('')).toBe(0x811c9dc5);
  expect(fnv1a('a')).toBe(0xe40c292c);
});

it('is deterministic and keeps the base hue between 225 and 274', () => {
  const id = '3f2b6c1e-0000-4000-8000-000000000001';
  const cover = coverFor(id);
  expect(coverFor(id)).toEqual(cover);
  const hue = Number(/hsl\((\d+) 45% 34%\)/.exec(cover.backgroundImage)?.[1]);
  expect(hue).toBeGreaterThanOrEqual(225);
  expect(hue).toBeLessThanOrEqual(274);
  expect(cover.backgroundSize).toBe('20px 20px, 20px 20px, 100% 100%');
});

it('layers the blueprint grid over the gradient', () => {
  expect(coverFor('3f2b6c1e-0000-4000-8000-000000000001').backgroundImage).toBe(
    'linear-gradient(rgb(255 255 255 / 0.07) 1px, transparent 1px), ' +
      'linear-gradient(90deg, rgb(255 255 255 / 0.07) 1px, transparent 1px), ' +
      'linear-gradient(313deg, hsl(273 45% 34%), hsl(322 40% 20%))',
  );
});

it('gives different ids different covers', () => {
  expect(coverFor('project-a').backgroundImage).not.toBe(coverFor('project-b').backgroundImage);
});
