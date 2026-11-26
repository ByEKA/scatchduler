import { describe, expect, it } from 'vitest';
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
});
