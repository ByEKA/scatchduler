import type {
  RelationshipType,
  ScheduleActivity,
  ScheduleDocument,
  ScheduleRelationship,
  SolverError,
  SolverWarning,
} from '@/data/schedule-types';

export interface ScheduleGraph {
  readonly activityOrder: readonly number[]; // topological order of non-LOE nodes over non-LOE links, then LOE nodes ordered by LOE→LOE links
  readonly nodes: readonly ScheduleActivity[]; // excludes wbs_summary
  readonly indexById: ReadonlyMap<string, number>;
  readonly incoming: readonly ScheduleRelationship[][];
  readonly outgoing: readonly ScheduleRelationship[][];
  /** Parallel to `incoming` / `outgoing`: index of each edge inside `activeRelationships`. */
  readonly incomingEdgeIndices: readonly number[][];
  readonly outgoingEdgeIndices: readonly number[][];
  /** Parallel to `activeRelationships`: predecessor/successor indices inside `nodes`. */
  readonly edgePredIndex: Int32Array;
  readonly edgeSuccIndex: Int32Array;
  readonly activeRelationships: readonly ScheduleRelationship[];
  readonly warnings: readonly SolverWarning[];
}

function relTypeCode(type: RelationshipType): number {
  switch (type) {
    case 'FS':
      return 0;
    case 'SS':
      return 1;
    case 'FF':
      return 2;
    case 'SF':
      return 3;
  }
}

/**
 * Builds the CPM dependency graph (excluding `wbs_summary`, ignoring dangling/self links,
 * deduplicating identical `(pred, succ, type)` links), runs Kahn topological sort with an
 * integer head-index queue, and falls back to an iterative DFS cycle finder safe at 50k+ depth.
 * LOE activities and links touching them take no part in the sort or the cycle check; they never
 * drive other activities.
 */
export function buildGraph(
  document: ScheduleDocument,
):
  | { ok: true; graph: ScheduleGraph }
  | { ok: false; error: Extract<SolverError, { code: 'SCHEDULE_CYCLE' }> } {
  const nodes: ScheduleActivity[] = [];
  const indexById = new Map<string, number>();

  for (let i = 0; i < document.activities.length; i++) {
    const act = document.activities[i]!;
    if (act.type === 'wbs_summary') continue;
    const idx = nodes.length;
    nodes.push(act);
    indexById.set(act.id, idx);
  }

  const n = nodes.length;
  const incoming: ScheduleRelationship[][] = Array.from({ length: n }, () => []);
  const outgoing: ScheduleRelationship[][] = Array.from({ length: n }, () => []);
  const incomingEdgeIndices: number[][] = Array.from({ length: n }, () => []);
  const outgoingEdgeIndices: number[][] = Array.from({ length: n }, () => []);
  // Links between two non-LOE activities drive the sort; links between two LOEs order the LOEs.
  // A link between an LOE and a non-LOE activity goes in neither list.
  const isLoe = new Uint8Array(n);
  let nonLoeCount = 0;
  for (let i = 0; i < n; i++) {
    if (nodes[i]!.type === 'level_of_effort') {
      isLoe[i] = 1;
    } else {
      nonLoeCount++;
    }
  }
  const drivingTargets: number[][] = Array.from({ length: n }, () => []);
  const inDegree = new Int32Array(n);
  const loeTargets: number[][] = Array.from({ length: n }, () => []);
  const loeInDegree = new Int32Array(n);

  const activeRelationships: ScheduleRelationship[] = [];
  const predIndices: number[] = [];
  const succIndices: number[] = [];
  const seenEdges = new Set<number>();
  const stride = Math.max(1, n);

  for (let i = 0; i < document.relationships.length; i++) {
    const rel = document.relationships[i]!;
    const u = indexById.get(rel.predecessorId);
    const v = indexById.get(rel.successorId);
    if (u === undefined || v === undefined || u === v) continue;

    const dedupKey = (u * stride + v) * 4 + relTypeCode(rel.type);
    if (seenEdges.has(dedupKey)) continue;
    seenEdges.add(dedupKey);

    const edgeIdx = activeRelationships.length;
    activeRelationships.push(rel);
    predIndices.push(u);
    succIndices.push(v);
    outgoing[u]!.push(rel);
    incoming[v]!.push(rel);
    outgoingEdgeIndices[u]!.push(edgeIdx);
    incomingEdgeIndices[v]!.push(edgeIdx);
    if (isLoe[u] === 0 && isLoe[v] === 0) {
      drivingTargets[u]!.push(v);
      inDegree[v] = inDegree[v]! + 1;
    } else if (isLoe[u] === 1 && isLoe[v] === 1) {
      loeTargets[u]!.push(v);
      loeInDegree[v] = loeInDegree[v]! + 1;
    }
  }

  // Kahn's topological sort with an integer head-index queue (never Array.shift()).
  const queue = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (isLoe[i] === 0 && inDegree[i] === 0) {
      queue[tail++] = i;
    }
  }

  const activityOrder: number[] = new Array<number>(n);
  let orderedCount = 0;
  let head = 0;
  while (head < tail) {
    const u = queue[head++]!;
    activityOrder[orderedCount++] = u;
    const targets = drivingTargets[u]!;
    for (let j = 0; j < targets.length; j++) {
      const v = targets[j]!;
      const nextDeg = inDegree[v]! - 1;
      inDegree[v] = nextDeg;
      if (nextDeg === 0) {
        queue[tail++] = v;
      }
    }
  }

  if (orderedCount === nonLoeCount) {
    // LOE nodes last: a second Kahn pass over LOE→LOE links, so chained LOEs come in order.
    for (let i = 0; i < n; i++) {
      if (isLoe[i] === 1 && loeInDegree[i] === 0) {
        queue[tail++] = i;
      }
    }
    while (head < tail) {
      const u = queue[head++]!;
      activityOrder[orderedCount++] = u;
      const targets = loeTargets[u]!;
      for (let j = 0; j < targets.length; j++) {
        const v = targets[j]!;
        const nextDeg = loeInDegree[v]! - 1;
        loeInDegree[v] = nextDeg;
        if (nextDeg === 0) {
          queue[tail++] = v;
        }
      }
    }
    // LOE nodes caught in a loop of LOE→LOE links, in ascending node index.
    for (let i = 0; i < n; i++) {
      if (isLoe[i] === 1 && loeInDegree[i]! > 0) {
        activityOrder[orderedCount++] = i;
      }
    }
    return {
      ok: true,
      graph: {
        activityOrder,
        nodes,
        indexById,
        incoming,
        outgoing,
        incomingEdgeIndices,
        outgoingEdgeIndices,
        edgePredIndex: Int32Array.from(predIndices),
        edgeSuccIndex: Int32Array.from(succIndices),
        activeRelationships,
        warnings: [],
      },
    };
  }

  // Iterative DFS over only non-LOE nodes left with inDegree > 0 to extract one clean cycle.
  // state: 0 = unvisited, 1 = on active path, 2 = finished (including Kahn-ordered and LOE nodes)
  const state = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (isLoe[i] === 1) state[i] = 2;
  }
  for (let i = 0; i < orderedCount; i++) {
    state[activityOrder[i]!] = 2;
  }

  const posInPath = new Int32Array(n);
  posInPath.fill(-1);
  const path: number[] = [];
  const stack: Array<{ node: number; edgeIdx: number }> = [];

  for (let start = 0; start < n; start++) {
    if (state[start] !== 0) continue;

    state[start] = 1;
    posInPath[start] = path.length;
    path.push(start);
    stack.push({ node: start, edgeIdx: 0 });

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const targets = drivingTargets[frame.node]!;
      if (frame.edgeIdx < targets.length) {
        const v = targets[frame.edgeIdx++]!;
        if (state[v] === 1) {
          const cycleStart = posInPath[v]!;
          const cycleNodes = path.slice(cycleStart);
          cycleNodes.push(v);
          const cycleIds = cycleNodes.map((idx) => nodes[idx]!.id);
          const cycleCodes = cycleNodes.map((idx) => nodes[idx]!.code);
          return {
            ok: false,
            error: {
              code: 'SCHEDULE_CYCLE',
              cycleIds,
              cycleCodes,
              message: `Circular logic found: ${cycleCodes.join(' → ')}. Break the loop to calculate.`,
            },
          };
        }
        if (state[v] === 0) {
          state[v] = 1;
          posInPath[v] = path.length;
          path.push(v);
          stack.push({ node: v, edgeIdx: 0 });
        }
      } else {
        stack.pop();
        path.pop();
        posInPath[frame.node] = -1;
        state[frame.node] = 2;
      }
    }
  }

  // Unreachable: orderedCount < nonLoeCount guarantees a cycle among the remaining non-LOE nodes.
  return {
    ok: false,
    error: {
      code: 'SCHEDULE_CYCLE',
      cycleIds: [],
      cycleCodes: [],
      message: 'Circular logic found: . Break the loop to calculate.',
    },
  };
}
