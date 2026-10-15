import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { withLatency } from '@/data/mock/latency';

afterEach(() => {
  vi.useRealTimers();
});

describe('withLatency', () => {
  it('resolves only after latencyMs', async () => {
    vi.useFakeTimers();
    let done = false;
    const result = withLatency(() => 42, { latencyMs: 400, failRate: 0, kind: 'read' }).then(
      (v) => {
        done = true;
        return v;
      },
    );
    await vi.advanceTimersByTimeAsync(399);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(42);
  });

  it('fails reads when the draw is below the fail rate', async () => {
    await expect(
      withLatency(() => 1, { latencyMs: 0, failRate: 0.5, kind: 'read', random: () => 0.1 }),
    ).rejects.toMatchObject({ code: 'network', message: 'Simulated network error' });
  });

  it('rejects failed reads with a RepositoryError, which errorMessage() recognizes', async () => {
    await expect(
      withLatency(() => 1, { latencyMs: 0, failRate: 1, kind: 'read', random: () => 0 }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('never fails writes', async () => {
    await expect(
      withLatency(() => 1, { latencyMs: 0, failRate: 1, kind: 'write', random: () => 0 }),
    ).resolves.toBe(1);
  });
});
