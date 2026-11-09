import {
  AuthApiError,
  AuthRetryableFetchError,
  createClient,
  FunctionsFetchError,
  FunctionsHttpError,
} from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { functionError, toRepositoryError } from '@/data/supabase/errors';

const pg = (code: string, message = 'x', hint = '') => ({ code, message, details: '', hint });

describe('toRepositoryError', () => {
  it.each([
    [
      pg('23505', 'duplicate key value violates unique constraint "projects_workspace_code_uq"'),
      'conflict',
      'This ID is already used in this workspace',
    ],
    [
      pg('23505', 'duplicate key value violates unique constraint "schedules_project_code_uq"'),
      'conflict',
      'This code is already used in this project.',
    ],
    [
      pg('23505', 'duplicate key value violates unique constraint "schedules_project_update_uq"'),
      'conflict',
      'This update number is already used in this project.',
    ],
    [
      pg('23505', 'duplicate key value violates unique constraint "schedules_one_primary_uq"'),
      'conflict',
      'Another change was saved at the same time. Refresh and try again.',
    ],
    [
      pg('23505', 'duplicate key value violates unique constraint "schedules_one_current_uq"'),
      'conflict',
      'Another change was saved at the same time. Refresh and try again.',
    ],
    [
      pg('23514', 'A workspace needs at least one owner.', 'app'),
      'validation',
      'A workspace needs at least one owner.',
    ],
    [
      pg('23514', 'new row violates check constraint "x"'),
      'validation',
      "Some values aren't valid. Check the form and try again.",
    ],
    [pg('42501', 'new row violates row-level security policy'), 'forbidden', expect.any(String)],
    [pg('P0002', 'Project not found', 'app'), 'not_found', 'Project not found'],
    [pg('PGRST301', 'JWT expired'), 'unauthorized', expect.any(String)],
    [
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      'unauthorized',
      'Wrong email or password',
    ],
    [
      new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
      'validation',
      'This link has expired or was already used.',
    ],
    [
      new AuthApiError('Password is too weak', 422, 'weak_password'),
      'validation',
      'Use at least 10 characters with letters and numbers',
    ],
    [
      new AuthApiError('Same password', 422, 'same_password'),
      'validation',
      'Choose a different password from your current one.',
    ],
    [
      new AuthApiError('Too many requests', 429, 'over_request_rate_limit'),
      'rate_limited',
      expect.any(String),
    ],
    [new AuthRetryableFetchError('Failed to fetch', 0), 'network', expect.any(String)],
    [{ name: 'StorageApiError', message: 'denied', status: 403 }, 'forbidden', expect.any(String)],
    [
      { name: 'StorageApiError', message: 'too big', statusCode: '413' },
      'validation',
      'This file is too large.',
    ],
    [new TypeError('Failed to fetch'), 'network', expect.any(String)],
    [new DOMException('The request timed out.', 'TimeoutError'), 'network', expect.any(String)],
    [
      { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' },
      'network',
      expect.any(String),
    ],
    [new Error('???'), 'unknown', expect.any(String)],
  ])('maps %o', (error, code, message) => {
    expect(toRepositoryError(error)).toMatchObject({ code, message });
  });

  it("uses the caller's not-found message", () => {
    expect(toRepositoryError(pg('PGRST116'), { notFound: 'Task not found' })).toMatchObject({
      code: 'not_found',
      message: 'Task not found',
    });
  });

  // Storage doesn't pass a failed fetch through: it wraps it in a StorageUnknownError.
  it.each([
    new TypeError('Failed to fetch'),
    new DOMException('The request timed out.', 'TimeoutError'),
  ])('maps a storage request whose fetch failed with %o to network', async (failure) => {
    const failingFetch: typeof fetch = () => Promise.reject(failure);
    const client = createClient('https://example.test', 'publishable-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: failingFetch },
    });
    const { error } = await client.storage
      .from('project-covers')
      .upload('w1/cover.jpg', new Blob(['x'], { type: 'image/jpeg' }));
    expect(error).toMatchObject({ name: 'StorageUnknownError' });
    expect(toRepositoryError(error)).toMatchObject({ code: 'network' });
  });
});

describe('functionError', () => {
  it.each([
    [400, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [409, 'conflict'],
    [429, 'rate_limited'],
    [502, 'unknown'],
  ])('maps status %i to %s with the function message', async (status, code) => {
    const error = new FunctionsHttpError(
      new Response(JSON.stringify({ message: 'pat@example.com is already a member.' }), { status }),
    );
    expect(await functionError(error)).toMatchObject({
      code,
      message: 'pat@example.com is already a member.',
    });
  });

  it('maps fetch failures to network', async () => {
    expect(await functionError(new FunctionsFetchError('offline'))).toMatchObject({
      code: 'network',
    });
  });
});
