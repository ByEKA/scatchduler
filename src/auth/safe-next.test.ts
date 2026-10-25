import { expect, it } from 'vitest';
import { safeNext } from '@/auth/safe-next';

it.each([
  ['/w/1/projects?x=1', '/w/1/projects?x=1'],
  [null, '/home'],
  [undefined, '/home'],
  ['', '/home'],
  ['//evil.example', '/home'],
  ['/\\evil.example', '/home'],
  ['https://evil.example', '/home'],
])('safeNext(%s) → %s', (input, expected) => {
  expect(safeNext(input)).toBe(expected);
});
