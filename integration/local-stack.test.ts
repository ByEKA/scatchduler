import { describe, expect, it } from 'vitest';
import { formatLocalEnv, parseStatus } from './local-stack';

describe('parseStatus', () => {
  it('reads the new key names', () => {
    const stack = parseStatus(
      JSON.stringify({
        API_URL: 'http://127.0.0.1:54321',
        PUBLISHABLE_KEY: 'sb_publishable_a',
        SECRET_KEY: 'sb_secret_b',
        DB_URL: 'postgresql://db',
        MAILPIT_URL: 'http://127.0.0.1:54324',
      }),
    );
    expect(stack).toEqual({
      apiUrl: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_a',
      secretKey: 'sb_secret_b',
      dbUrl: 'postgresql://db',
      mailUrl: 'http://127.0.0.1:54324',
    });
  });

  it('falls back to the legacy names', () => {
    const stack = parseStatus(
      JSON.stringify({
        API_URL: 'http://127.0.0.1:54321',
        ANON_KEY: 'anon',
        SERVICE_ROLE_KEY: 'service',
        DB_URL: 'postgresql://db',
        INBUCKET_URL: 'http://127.0.0.1:54324',
      }),
    );
    expect([stack.publishableKey, stack.secretKey, stack.mailUrl]).toEqual([
      'anon',
      'service',
      'http://127.0.0.1:54324',
    ]);
  });

  it('names the missing key', () => {
    expect(() => parseStatus(JSON.stringify({ API_URL: 'x', DB_URL: 'y' }))).toThrow(
      'supabase status is missing PUBLISHABLE_KEY',
    );
  });

  it('formats the local env file', () => {
    const stack = {
      apiUrl: 'http://127.0.0.1:54321',
      publishableKey: 'pk',
      secretKey: 'sk',
      dbUrl: 'db',
      mailUrl: 'mail',
    };
    expect(formatLocalEnv(stack)).toBe(
      'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=pk\n',
    );
  });
});
