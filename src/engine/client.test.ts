import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngineClient, EngineClientError, type WorkerLike } from '@/engine/client';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';

function fakeWorker(): WorkerLike & { sent: unknown[]; terminated: boolean } {
  const w: WorkerLike & { sent: unknown[]; terminated: boolean } = {
    sent: [],
    terminated: false,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(msg) {
      this.sent.push(msg);
    },
    terminate() {
      this.terminated = true;
    },
  };
  return w;
}

afterEach(() => vi.useRealTimers());

describe('engine client', () => {
  it('solves, caches for traceDrivingPath and computes rollups via in-thread fallback', async () => {
    const client = createEngineClient({ createWorker: () => null });
    const doc = makeDocument({
      wbs: [{ id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 }],
      activities: [
        makeActivity({ id: 'a', code: 'A10', wbsId: 'w1' }),
        makeActivity({ id: 'b', code: 'A20', wbsId: 'w1' }),
      ],
      relationships: [makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b' })],
    });
    await expect(client.traceDrivingPath('b')).rejects.toMatchObject({
      code: 'failed',
      message: 'No calculated schedule available.',
    });

    const res = await client.solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(res.ok).toBe(true);
    const path = await client.traceDrivingPath('b');
    expect(path.activityIds).toEqual(['b', 'a']);
    expect(path.relationshipIds).toEqual(['r1']);
    expect(path.hops).toBe(1);

    const rollups = await client.rollup(doc, res.ok ? res.summary : null);
    expect(rollups.w1?.activityCount).toBe(2);
    client.dispose();
  });

  it('times out and terminates a hung worker, ignores stale replies after cancel, and rejects on dispose', async () => {
    vi.useFakeTimers();
    const workers: Array<ReturnType<typeof fakeWorker>> = [];
    const client = createEngineClient({
      createWorker: () => {
        const w = fakeWorker();
        workers.push(w);
        return w;
      },
      watchdogMs: 500,
    });
    const doc = makeDocument();
    const pending = client.solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(501);
    await rejection;
    expect(workers[0]!.terminated).toBe(true);

    const p2 = client.solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(workers).toHaveLength(2);
    client.cancel();
    await expect(p2).rejects.toBeInstanceOf(EngineClientError);
    await expect(p2).rejects.toMatchObject({ code: 'cancelled' });
    expect(workers[1]!.terminated).toBe(true);

    // Worker error rejects pending and resets transport cleanly
    const p3 = client.solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    workers[2]!.onerror?.({ message: 'Worker crashed' });
    await expect(p3).rejects.toMatchObject({ code: 'failed', message: 'Worker crashed' });

    client.dispose();
    await expect(
      client.solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' }),
    ).rejects.toMatchObject({
      code: 'disposed',
    });
  });
});
