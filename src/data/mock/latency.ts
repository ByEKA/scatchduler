import { RepositoryError } from '@/data/errors';

export interface LatencyOptions {
  latencyMs: number;
  /** From 0 to 1: the share of reads that fail. Writes never fail randomly (spec §5.6). */
  failRate: number;
  kind: 'read' | 'write';
  /** Returns a number in [0, 1); `Math.random` by default. */
  random?: () => number;
}

/**
 * Runs `op` after `latencyMs`. A read rejects with a simulated network error instead when the
 * random draw falls below `failRate`.
 */
export async function withLatency<T>(
  op: () => T | Promise<T>,
  options: LatencyOptions,
): Promise<T> {
  const { latencyMs, failRate, kind, random = Math.random } = options;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, latencyMs);
  });
  if (kind === 'read' && random() < failRate) {
    throw new RepositoryError('network', 'Simulated network error');
  }
  return await op();
}
