// Turns Supabase errors (PostgREST, Postgres, Auth, Storage, Edge Functions, fetch) into
// `RepositoryError`s, following the P2 spec §8.4 table. Only `conflict` and `validation` carry
// adapter copy the UI shows; the other codes use the shared copy from P2 spec §6.1.
import {
  FunctionsFetchError,
  FunctionsHttpError,
  isAuthError,
  isAuthRetryableFetchError,
} from '@supabase/supabase-js';
import { RepositoryError, type RepositoryErrorCode } from '@/data/errors';

const GENERIC = 'Something went wrong. Please try again.';
const DEFAULT_MESSAGES: Record<RepositoryErrorCode, string> = {
  network: "Can't reach the server. Check your connection and try again.",
  forbidden: "You don't have permission to do that.",
  unauthorized: 'Your session expired. Please sign in again.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  validation: "Some values aren't valid. Check the form and try again.",
  conflict: GENERIC,
  not_found: GENERIC,
  unknown: GENERIC,
};

const CODE_TAKEN = 'This ID is already used in this workspace';
const WRONG_PASSWORD = 'Wrong email or password';
const LINK_EXPIRED = 'This link has expired or was already used.';
const WEAK_PASSWORD = 'Use at least 10 characters with letters and numbers';
const SAME_PASSWORD = 'Choose a different password from your current one.';
const FILE_TOO_LARGE = 'This file is too large.';

/** Auth error codes for a link (or code exchange) that can no longer be verified. */
const LINK_FAILURE_CODES = new Set(['otp_expired', 'flow_state_expired', 'flow_state_not_found']);
const AUTH_RATE_LIMIT_CODES = new Set([
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'over_sms_send_rate_limit',
]);
const AUTH_SESSION_CODES = new Set([
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'bad_jwt',
  'no_authorization',
]);
/** PostgREST codes for an expired, invalid or missing JWT. */
const POSTGREST_JWT_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);
/** Names `fetch` failures carry; PostgREST puts them in front of the message (`TypeError: …`). */
const TRANSPORT_ERROR_NAMES = ['TypeError', 'TimeoutError', 'AbortError', 'FetchError'];
const TRANSPORT_MESSAGE = new RegExp(`^(${TRANSPORT_ERROR_NAMES.join('|')}): `);

type ErrorRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is ErrorRecord =>
  typeof value === 'object' && value !== null;

const stringField = (record: ErrorRecord, field: string): string | undefined =>
  typeof record[field] === 'string' ? record[field] : undefined;

function make(
  code: RepositoryErrorCode,
  message: string | undefined,
  cause: unknown,
): RepositoryError {
  const error = new RepositoryError(code, message ?? DEFAULT_MESSAGES[code]);
  error.cause = cause;
  return error;
}

/**
 * A `fetch` that rejected, timed out or was aborted, as thrown, as PostgREST reports it, or as
 * Storage wraps it (a `StorageUnknownError` keeps the thrown error in `originalError`).
 */
function isTransportFailure(error: unknown, depth = 0): boolean {
  if (error instanceof TypeError) return true;
  if (!isRecord(error)) return false;
  const name = stringField(error, 'name');
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  if (
    depth < 3 &&
    (error.__isStorageError === true || name === 'StorageUnknownError') &&
    'originalError' in error
  ) {
    return isTransportFailure(error.originalError, depth + 1);
  }
  // PostgREST returns (doesn't throw) `{ message: '<Name>: <message>', code: '' }` with status 0.
  const message = stringField(error, 'message');
  return error.code === '' && message !== undefined && TRANSPORT_MESSAGE.test(message);
}

/** HTTP status from `status` (number) or Storage's `statusCode` (string). */
function httpStatus(record: ErrorRecord): number | undefined {
  const statusCode = record.statusCode;
  if (typeof statusCode === 'string' && /^\d{3}$/.test(statusCode)) return Number(statusCode);
  if (typeof statusCode === 'number') return statusCode;
  return typeof record.status === 'number' ? record.status : undefined;
}

function fromStatus(status: number | undefined, cause: unknown): RepositoryError | null {
  switch (status) {
    case 401:
      return make('unauthorized', undefined, cause);
    case 403:
      return make('forbidden', undefined, cause);
    case 413:
      return make('validation', FILE_TOO_LARGE, cause);
    case 429:
      return make('rate_limited', undefined, cause);
    default:
      return null;
  }
}

function fromAuth(error: ErrorRecord): RepositoryError {
  const code = stringField(error, 'code');
  const name = stringField(error, 'name');
  const status = typeof error.status === 'number' ? error.status : undefined;
  if (code === 'invalid_credentials') return make('unauthorized', WRONG_PASSWORD, error);
  if (code !== undefined && LINK_FAILURE_CODES.has(code)) {
    return make('validation', LINK_EXPIRED, error);
  }
  if (code === 'weak_password' || name === 'AuthWeakPasswordError') {
    return make('validation', WEAK_PASSWORD, error);
  }
  if (code === 'same_password') return make('validation', SAME_PASSWORD, error);
  if (code === 'signup_disabled') return make('forbidden', undefined, error);
  if ((code !== undefined && AUTH_RATE_LIMIT_CODES.has(code)) || status === 429) {
    return make('rate_limited', undefined, error);
  }
  if (
    (code !== undefined && AUTH_SESSION_CODES.has(code)) ||
    name === 'AuthSessionMissingError' ||
    status === 401
  ) {
    return make('unauthorized', undefined, error);
  }
  return make('unknown', undefined, error);
}

/** Postgres and PostgREST errors, recognized by their `code`. */
function fromPostgres(error: ErrorRecord, code: string, notFound: string | undefined) {
  const message = stringField(error, 'message') ?? '';
  switch (code) {
    case '23505':
      return message.includes('projects_workspace_code_uq')
        ? make('conflict', CODE_TAKEN, error)
        : null;
    case '23514':
      return stringField(error, 'hint') === 'app' && message !== ''
        ? make('validation', message, error)
        : make('validation', undefined, error);
    case '42501':
      return make('forbidden', undefined, error);
    case 'PGRST116':
      return make('not_found', notFound, error);
    default:
      return POSTGREST_JWT_CODES.has(code) ? make('unauthorized', undefined, error) : null;
  }
}

export function toRepositoryError(
  error: unknown,
  context: { notFound?: string } = {},
): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (isTransportFailure(error) || isAuthRetryableFetchError(error)) {
    return make('network', undefined, error);
  }
  if (!isRecord(error)) return make('unknown', undefined, error);
  if (isAuthError(error)) return fromAuth(error as unknown as ErrorRecord);
  const code = stringField(error, 'code');
  if (code) {
    const mapped = fromPostgres(error, code, context.notFound);
    if (mapped) return mapped;
  }
  return fromStatus(httpStatus(error), error) ?? make('unknown', undefined, error);
}

const FUNCTION_STATUS_CODES: Record<number, RepositoryErrorCode> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  409: 'conflict',
  429: 'rate_limited',
};

/**
 * Errors from `functions.invoke`. A non-2xx response keeps its status and the function's JSON
 * `{ message }`; a request that never reached the function is `network`.
 */
export async function functionError(error: unknown): Promise<RepositoryError> {
  if (error instanceof FunctionsFetchError) return make('network', undefined, error);
  if (error instanceof FunctionsHttpError) {
    const response: unknown = error.context;
    if (response instanceof Response) {
      const code = FUNCTION_STATUS_CODES[response.status] ?? 'unknown';
      let message: string | undefined;
      try {
        const body: unknown = await response.clone().json();
        if (isRecord(body) && typeof body.message === 'string' && body.message !== '') {
          message = body.message;
        }
      } catch {
        // Not JSON: the shared copy for the code is shown instead.
      }
      return make(code, message, error);
    }
    return make('unknown', undefined, error);
  }
  return toRepositoryError(error);
}
