import { expect, it } from 'vitest';
import { newPasswordSchema } from '@/features/auth/password-schema';

const issues = (password: string, confirm: string) =>
  newPasswordSchema.safeParse({ password, confirm }).error?.issues.map((i) => i.message) ?? [];

it('needs 10 characters with letters and numbers, typed twice', () => {
  expect(issues('short12', 'short12')).toEqual([
    'Use at least 10 characters with letters and numbers',
  ]);
  expect(issues('onlyletterspassword', 'onlyletterspassword')).toEqual([
    'Use at least 10 characters with letters and numbers',
  ]);
  expect(issues('letters12345', 'letters12346')).toEqual(["Passwords don't match"]);
  expect(issues('letters12345', 'letters12345')).toEqual([]);
});
