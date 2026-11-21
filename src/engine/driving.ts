import type {
  ComputedScheduleSummary,
  DrivingPath,
  ScheduleDocument,
  ScheduleRelationship,
} from '@/data/schedule-types';

/**
 * Traces the driving path backward from `activityId` to all root drivers using an iterative
 * integer-head-index BFS queue (safe at 50,000+ chain depth with zero recursion).
 */
export function traceDrivingPath(
  document: ScheduleDocument,
  summary: ComputedScheduleSummary,
  activityId: string,
): DrivingPath {
  if (!summary.activities[activityId]) {
    return { activityIds: [], relationshipIds: [], hops: 0 };
  }

  const incomingDriving = new Map<string, ScheduleRelationship[]>();
  for (let i = 0; i < document.relationships.length; i++) {
    const rel = document.relationships[i]!;
    if (!summary.relationships[rel.id]?.isDriving) continue;
    let list = incomingDriving.get(rel.successorId);
    if (!list) {
      list = [];
      incomingDriving.set(rel.successorId, list);
    }
    list.push(rel);
  }

  const visitedActivities = new Set<string>([activityId]);
  const visitedRelationships = new Set<string>();
  const activityIds: string[] = [activityId];
  const relationshipIds: string[] = [];

  const queueIds: string[] = [activityId];
  const queueDepths: number[] = [0];
  let head = 0;
  let maxDepth = 0;

  while (head < queueIds.length) {
    const curId = queueIds[head]!;
    const depth = queueDepths[head]!;
    head++;
    if (depth > maxDepth) maxDepth = depth;

    const incoming = incomingDriving.get(curId);
    if (!incoming) continue;
    for (let j = 0; j < incoming.length; j++) {
      const rel = incoming[j]!;
      if (!visitedRelationships.has(rel.id)) {
        visitedRelationships.add(rel.id);
        relationshipIds.push(rel.id);
      }
      if (!visitedActivities.has(rel.predecessorId) && summary.activities[rel.predecessorId]) {
        visitedActivities.add(rel.predecessorId);
        activityIds.push(rel.predecessorId);
        queueIds.push(rel.predecessorId);
        queueDepths.push(depth + 1);
      }
    }
  }

  return {
    activityIds,
    relationshipIds,
    hops: maxDepth,
  };
}
