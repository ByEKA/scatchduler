export type RepositoryErrorCode =
  'not_found' | 'conflict' | 'validation' | 'unauthorized' | 'network' | 'unknown';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;
  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}
