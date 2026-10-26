import { describe, expect, it } from 'vitest';
import { findSecrets } from './check-secrets.mjs';

const jwt = (payload) =>
  [
    'eyJhbGciOiJIUzI1NiJ9',
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
    'signature',
  ].join('.');

describe('findSecrets', () => {
  it('flags secret keys, service-role tokens and the exact secret value', () => {
    expect(findSecrets([{ path: 'a.js', content: 'const k = "sb_secret_abc123"' }])).toEqual([
      'a.js: sb_secret_ key',
    ]);
    expect(
      findSecrets([{ path: 'b.js', content: `x="${jwt({ role: 'service_role' })}"` }]),
    ).toEqual(['b.js: service_role JWT']);
    expect(
      findSecrets([{ path: 'c.js', content: 'k="my-exact-secret"' }], {
        secretValue: 'my-exact-secret',
      }),
    ).toEqual(['c.js: SUPABASE_SECRET_KEY value']);
  });

  it('accepts publishable keys and anon tokens', () => {
    expect(
      findSecrets([{ path: 'd.js', content: `"sb_publishable_x" "${jwt({ role: 'anon' })}"` }]),
    ).toEqual([]);
  });

  it('ignores the bare prefix supabase-js ships in its bundle', () => {
    expect(findSecrets([{ path: 'e.js', content: 'k.startsWith(`sb_secret_`)' }])).toEqual([]);
  });
});
