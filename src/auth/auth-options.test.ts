import { expect, it } from 'vitest';
import { authOptions } from '@/auth/auth-options';

it.each([
  [{}, { demo: true, google: true }],
  [{ VITE_DATA_SOURCE: 'supabase' }, { demo: false, google: false }],
  [
    { VITE_DATA_SOURCE: 'supabase', VITE_GOOGLE_SIGN_IN: 'true' },
    { demo: false, google: true },
  ],
])('authOptions(%o)', (env, expected) => {
  expect(authOptions(env)).toEqual(expected);
});
