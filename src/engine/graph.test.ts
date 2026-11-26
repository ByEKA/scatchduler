import { describe, expect, it } from 'vitest';
import { solve } from '@/engine';
import { buildGraph } from '@/engine/graph';
import {
  generateLargeDocument,
  makeActivity,
  makeDocument,
  makeRelationship,
} from '@/engine/testing';

describe('graph', () => {
  it('excludes wbs_summary, ignores self-links, deduplicates links and returns valid topo order', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'sum', code: 'S1', type: 'wbs_summary' }),
        makeActivity({ id: 'b', code: 'A20' }),
        makeActivity({ id: 'a', code: 'A10' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b', type: 'FS' }),
        makeRelationship({ id: 'r2', predecessorId: 'a', successorId: 'b', type: 'FS' }),
        makeRelationship({ id: 'r3', predecessorId: 'a', successorId: 'a', type: 'FS' }),
        makeRelationship({ id: 'r4', predecessorId: 'sum', successorId: 'b', type: 'FS' }),
        makeRelationship({ id: 'r5', predecessorId: 'missing', successorId: 'b', type: 'FS' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.graph.nodes.map((n) => n.id)).toEqual(['b', 'a']);
    expect(res.graph.activityOrder.map((i) => res.graph.nodes[i]!.code)).toEqual(['A10', 'A20']);
    expect(res.graph.activeRelationships.map((r) => r.id)).toEqual(['r1']);
  });

  it('reports a minimal cycle with spec §5.5 copy', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a', code: 'A1010' }),
        makeActivity({ id: 'b', code: 'A1020' }),
        makeActivity({ id: 'c', code: 'A1030' }),
        makeActivity({ id: 'd', code: 'A1040' }),
      ],
      relationships: [
        makeRelationship({ id: 'r0', predecessorId: 'd', successorId: 'a' }),
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'b' }),
        makeRelationship({ id: 'r2', predecessorId: 'b', successorId: 'c' }),
        makeRelationship({ id: 'r3', predecessorId: 'c', successorId: 'a' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('SCHEDULE_CYCLE');
    expect(res.error.cycleIds).toEqual(['a', 'b', 'c', 'a']);
    expect(res.error.cycleCodes).toEqual(['A1010', 'A1020', 'A1030', 'A1010']);
    expect(res.error.message).toBe(
      'Circular logic found: A1010 → A1020 → A1030 → A1010. Break the loop to calculate.',
    );
  });

  it('sorts a 50,000-node chain and detects a 50,000-node cycle without stack overflow', () => {
    const chain = generateLargeDocument(50_000, 49_999);
    const ok = buildGraph(chain);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.graph.activityOrder).toHaveLength(50_000);

    const looped = {
      ...chain,
      relationships: [
        ...chain.relationships,
        makeRelationship({
          id: 'close-loop',
          predecessorId: chain.activities[49_999]!.id,
          successorId: chain.activities[0]!.id,
        }),
      ],
    };
    const err = buildGraph(looped);
    expect(err.ok).toBe(false);
    if (!err.ok) expect(err.error.cycleIds.length).toBe(50_001);
  });

  it('leaves LOE activities and their links out of the sort and the cycle check', () => {
    // A FS→ L, L SS→ B, B FS→ A: a loop only through the LOE (as in 6 real XER files).
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a', code: 'A10', originalDuration: 480 }),
        makeActivity({ id: 'l', code: 'L10', type: 'level_of_effort', originalDuration: 480 }),
        makeActivity({ id: 'b', code: 'B10', originalDuration: 2400 }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'l', type: 'FS' }),
        makeRelationship({ id: 'r2', predecessorId: 'l', successorId: 'b', type: 'SS' }),
        makeRelationship({ id: 'r3', predecessorId: 'b', successorId: 'a', type: 'FS' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.graph.activityOrder.map((i) => res.graph.nodes[i]!.code)).toEqual([
      'B10',
      'A10',
      'L10',
    ]);

    const solved = solve(doc, { calculatedAt: '2026-01-05T08:00:00.000Z' });
    expect(solved.ok).toBe(true);
    if (!solved.ok) return;
    expect(solved.summary.activities.b).toMatchObject({
      earlyStart: '2026-01-05T08:00',
      earlyFinish: '2026-01-09T17:00',
    });
    expect(solved.summary.activities.a).toMatchObject({
      earlyStart: '2026-01-12T08:00',
      earlyFinish: '2026-01-12T17:00',
    });
    expect(solved.summary.activities.l!.earlyStart).toBe('2026-01-05T08:00');
    expect(solved.summary.warnings.map((w) => w.code)).toEqual(['LOE_UNBOUNDED']);
  });

  it('reports a loop of non-LOE activities with its own path when an LOE hangs off it', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a', code: 'A1010' }),
        makeActivity({ id: 'l', code: 'L1010', type: 'level_of_effort' }),
        makeActivity({ id: 'b', code: 'A1020' }),
        makeActivity({ id: 'c', code: 'A1030' }),
      ],
      relationships: [
        makeRelationship({ id: 'r0', predecessorId: 'a', successorId: 'l', type: 'SS' }),
        makeRelationship({ id: 'r1', predecessorId: 'l', successorId: 'c', type: 'FF' }),
        makeRelationship({ id: 'r2', predecessorId: 'a', successorId: 'b' }),
        makeRelationship({ id: 'r3', predecessorId: 'b', successorId: 'c' }),
        makeRelationship({ id: 'r4', predecessorId: 'c', successorId: 'a' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.cycleIds).toEqual(['a', 'b', 'c', 'a']);
    expect(res.error.cycleCodes).toEqual(['A1010', 'A1020', 'A1030', 'A1010']);
    expect(res.error.message).toBe(
      'Circular logic found: A1010 → A1020 → A1030 → A1010. Break the loop to calculate.',
    );
  });

  it('orders LOE activities after every other activity, chained LOEs after their LOE predecessor', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'l2', code: 'L20', type: 'level_of_effort' }),
        makeActivity({ id: 'a', code: 'A10' }),
        makeActivity({ id: 'l1', code: 'L10', type: 'level_of_effort' }),
        makeActivity({ id: 'b', code: 'B10' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a', successorId: 'l1', type: 'SS' }),
        makeRelationship({ id: 'r2', predecessorId: 'l1', successorId: 'l2', type: 'SS' }),
        makeRelationship({ id: 'r3', predecessorId: 'l2', successorId: 'b', type: 'FF' }),
        makeRelationship({ id: 'r4', predecessorId: 'a', successorId: 'b' }),
      ],
    });
    const res = buildGraph(doc);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.graph.activityOrder.map((i) => res.graph.nodes[i]!.code)).toEqual([
      'A10',
      'B10',
      'L10',
      'L20',
    ]);

    const looped = {
      ...doc,
      relationships: [
        ...doc.relationships,
        makeRelationship({ id: 'r5', predecessorId: 'l2', successorId: 'l1', type: 'FF' }),
      ],
    };
    const loopRes = buildGraph(looped);
    expect(loopRes.ok).toBe(true);
    if (!loopRes.ok) return;
    expect(loopRes.graph.activityOrder.map((i) => loopRes.graph.nodes[i]!.code)).toEqual([
      'A10',
      'B10',
      'L20',
      'L10',
    ]);
  });
});
