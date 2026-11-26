import {
  MAX_SCHEDULE_ACTIVITIES,
  MAX_SCHEDULE_RELATIONSHIPS,
  type RelationshipType,
  type ScheduleActivity,
  type ScheduleDocument,
  type ScheduleRelationship,
  type ScheduleSettings,
  type ScheduleWbsNode,
} from '@/data/schedule-types';

export type ActivityChanges = Partial<
  Pick<
    ScheduleActivity,
    | 'code'
    | 'name'
    | 'calendarId'
    | 'type'
    | 'originalDuration'
    | 'remainingDuration'
    | 'status'
    | 'actualStart'
    | 'actualFinish'
    | 'percent'
    | 'constraint'
    | 'secondaryConstraint'
    | 'notes'
  >
>;

export type ScheduleCommand =
  | { type: 'addActivity'; wbsId: string | null; afterActivityId: string | null }
  | { type: 'updateActivity'; activityId: string; changes: ActivityChanges }
  | { type: 'deleteActivities'; activityIds: string[] }
  | { type: 'moveActivity'; activityId: string; wbsId: string | null; order: number }
  | { type: 'addWbsNode'; parentId: string | null; afterWbsId: string | null }
  | {
      type: 'updateWbsNode';
      wbsId: string;
      changes: Partial<Pick<ScheduleWbsNode, 'code' | 'name'>>;
    }
  | { type: 'deleteWbsNode'; wbsId: string }
  | {
      type: 'addRelationship';
      predecessorId: string;
      successorId: string;
      relType: RelationshipType;
      lagMinutes: number;
      lagElapsed: boolean;
    }
  | {
      type: 'updateRelationship';
      relationshipId: string;
      changes: Partial<Pick<ScheduleRelationship, 'type' | 'lagMinutes' | 'lagElapsed'>>;
    }
  | { type: 'deleteRelationship'; relationshipId: string }
  | { type: 'updateScheduleSettings'; changes: Partial<ScheduleSettings> };

export type Patch =
  | { op: 'set'; collection: 'activities' | 'relationships' | 'wbs'; id: string; value: unknown }
  | {
      op: 'insert';
      collection: 'activities' | 'relationships' | 'wbs';
      index: number;
      value: unknown;
    }
  | { op: 'remove'; collection: 'activities' | 'relationships' | 'wbs'; id: string }
  | { op: 'settings'; value: ScheduleSettings };

export type CommandResult =
  | {
      ok: true;
      document: ScheduleDocument;
      forward: Patch[];
      inverse: Patch[];
      stale: boolean;
      selectId: string | null;
    }
  | { ok: false; error: string };

export const HISTORY_LIMIT = 100;

export interface HistoryItem {
  command: ScheduleCommand;
  forward: Patch[];
  inverse: Patch[];
}

export interface EditHistory {
  past: HistoryItem[];
  future: HistoryItem[];
}

const MAX_CODE_LENGTH = 64;

const CALCULATION_SETTING_KEYS: ReadonlyArray<keyof ScheduleSettings> = [
  'profile',
  'ruleOverrides',
  'progressMode',
  'lagCalendar',
  'criticalDefinition',
  'criticalThresholdMinutes',
  'nearCriticalThresholdMinutes',
  'projectStart',
  'mustFinishBy',
  'statusDate',
  'defaultCalendarId',
];

function defaultNewId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2, 11)}`;
}

function generateNextActivityCode(activities: readonly ScheduleActivity[]): string {
  const existing = new Set(activities.map((a) => a.code.trim().toLowerCase()));
  let bestPrefix = 'A';
  let bestNumber = 1000;
  let bestWidth = 4;
  let foundNumeric = false;

  for (const act of activities) {
    const match = /^(.*?)(\d+)$/.exec(act.code.trim());
    if (!match) continue;
    const prefix = match[1] ?? '';
    const digits = match[2] ?? '';
    const num = Number.parseInt(digits, 10);
    if (!Number.isSafeInteger(num)) continue;
    if (!foundNumeric || num > bestNumber) {
      foundNumeric = true;
      bestPrefix = prefix;
      bestNumber = num;
      bestWidth = digits.length;
    }
  }

  let nextNum = foundNumeric ? bestNumber + 10 : 1010;
  let candidate = `${bestPrefix}${String(nextNum).padStart(bestWidth, '0')}`;
  while (existing.has(candidate.toLowerCase())) {
    nextNum += 10;
    candidate = `${bestPrefix}${String(nextNum).padStart(bestWidth, '0')}`;
  }
  return candidate;
}

function generateNextWbsCode(wbs: readonly ScheduleWbsNode[], parentId: string | null): string {
  const parent = parentId ? wbs.find((node) => node.id === parentId) : null;
  const prefix = parent ? `${parent.code}.` : '';
  const siblingCodes = new Set(
    wbs.filter((node) => node.parentId === parentId).map((node) => node.code.trim().toLowerCase()),
  );
  let seq = 1;
  let candidate = `${prefix}${seq}`;
  while (siblingCodes.has(candidate.toLowerCase())) {
    seq += 1;
    candidate = `${prefix}${seq}`;
  }
  return candidate;
}

function computeNextOrder(
  siblings: ReadonlyArray<{ id: string; order: number }>,
  afterId: string | null,
): number {
  if (siblings.length === 0) return 0;
  const sorted = [...siblings].sort((a, b) => a.order - b.order);
  if (afterId) {
    const idx = sorted.findIndex((item) => item.id === afterId);
    if (idx !== -1) {
      const current = sorted[idx]!;
      const next = sorted[idx + 1];
      if (!next) return current.order + 1;
      if (next.order > current.order + 1) return current.order + 1;
      return (current.order + next.order) / 2;
    }
  }
  return sorted[sorted.length - 1]!.order + 1;
}

function isMilestoneType(type: ScheduleActivity['type']): boolean {
  return type === 'start_milestone' || type === 'finish_milestone';
}

export function applyPatches(
  document: ScheduleDocument,
  patches: readonly Patch[],
): ScheduleDocument {
  if (patches.length === 0) return document;

  let activities = document.activities;
  let relationships = document.relationships;
  let wbs = document.wbs;
  let settings = document.settings;
  let activitiesCloned = false;
  let relationshipsCloned = false;
  let wbsCloned = false;

  const ensureCollection = (collection: 'activities' | 'relationships' | 'wbs') => {
    if (collection === 'activities') {
      if (!activitiesCloned) {
        activities = [...activities];
        activitiesCloned = true;
      }
      return activities as Array<{ id: string }>;
    }
    if (collection === 'relationships') {
      if (!relationshipsCloned) {
        relationships = [...relationships];
        relationshipsCloned = true;
      }
      return relationships as Array<{ id: string }>;
    }
    if (!wbsCloned) {
      wbs = [...wbs];
      wbsCloned = true;
    }
    return wbs as Array<{ id: string }>;
  };

  for (const patch of patches) {
    if (patch.op === 'settings') {
      settings = patch.value;
      continue;
    }
    const list = ensureCollection(patch.collection);
    if (patch.op === 'set') {
      const idx = list.findIndex((item) => item.id === patch.id);
      if (idx !== -1) {
        list[idx] = patch.value as { id: string };
      }
    } else if (patch.op === 'insert') {
      const clamped = Math.max(0, Math.min(patch.index, list.length));
      list.splice(clamped, 0, patch.value as { id: string });
    } else if (patch.op === 'remove') {
      const idx = list.findIndex((item) => item.id === patch.id);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }

  return {
    ...document,
    settings,
    wbs,
    activities,
    relationships,
  };
}

export function applyCommand(
  document: ScheduleDocument,
  command: ScheduleCommand,
  newId: () => string = defaultNewId,
): CommandResult {
  switch (command.type) {
    case 'addActivity': {
      if (document.activities.length >= MAX_SCHEDULE_ACTIVITIES) {
        return { ok: false, error: 'Maximum activity limit reached.' };
      }
      if (command.wbsId !== null && !document.wbs.some((w) => w.id === command.wbsId)) {
        return { ok: false, error: 'WBS element not found.' };
      }

      const defaultCal =
        document.calendars.find((c) => c.id === document.settings.defaultCalendarId) ??
        document.calendars[0];
      const hoursPerDay = defaultCal?.hoursPerDay ?? 8;
      const defaultDuration = Math.round(5 * hoursPerDay * 60);
      const calendarId = defaultCal?.id ?? document.settings.defaultCalendarId;

      const afterIndex = command.afterActivityId
        ? document.activities.findIndex((a) => a.id === command.afterActivityId)
        : -1;
      const insertIndex = afterIndex !== -1 ? afterIndex + 1 : document.activities.length;
      const sameWbs = document.activities.filter((a) => a.wbsId === command.wbsId);
      const order = computeNextOrder(sameWbs, command.afterActivityId);

      const activity: ScheduleActivity = {
        id: newId(),
        code: generateNextActivityCode(document.activities),
        name: 'New activity',
        wbsId: command.wbsId,
        calendarId,
        type: 'task',
        order,
        originalDuration: defaultDuration,
        remainingDuration: defaultDuration,
        status: 'not_started',
        actualStart: null,
        actualFinish: null,
        percent: { duration: 0, physical: 0, type: 'duration' },
        constraint: null,
        secondaryConstraint: null,
        notes: null,
        flags: { manual: false, elapsed: false, resourceDependent: false },
        keys: { taskId: null, uid: null, guid: null },
        sourceDates: null,
      };

      const forward: Patch[] = [
        { op: 'insert', collection: 'activities', index: insertIndex, value: activity },
      ];
      const inverse: Patch[] = [{ op: 'remove', collection: 'activities', id: activity.id }];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: true,
        selectId: activity.id,
      };
    }

    case 'updateActivity': {
      const existing = document.activities.find((a) => a.id === command.activityId);
      if (!existing) {
        return { ok: false, error: 'Activity not found.' };
      }

      const { changes } = command;
      let nextCode = existing.code;
      if (changes.code !== undefined) {
        const trimmed = changes.code.trim();
        if (trimmed.length === 0 || trimmed.length > MAX_CODE_LENGTH) {
          return { ok: false, error: 'Enter an activity code.' };
        }
        const normalized = trimmed.toLowerCase();
        const duplicate = document.activities.some(
          (a) => a.id !== existing.id && a.code.trim().toLowerCase() === normalized,
        );
        if (duplicate) {
          return { ok: false, error: 'This activity code is already used.' };
        }
        nextCode = trimmed;
      }

      let nextName = existing.name;
      if (changes.name !== undefined) {
        const trimmed = changes.name.trim();
        if (trimmed.length === 0) {
          return { ok: false, error: 'Enter an activity name.' };
        }
        nextName = trimmed;
      }

      if (
        (changes.originalDuration !== undefined &&
          (!Number.isFinite(changes.originalDuration) || changes.originalDuration < 0)) ||
        (changes.remainingDuration !== undefined &&
          (!Number.isFinite(changes.remainingDuration) || changes.remainingDuration < 0))
      ) {
        return { ok: false, error: "Duration can't be negative." };
      }

      if (
        changes.calendarId !== undefined &&
        !document.calendars.some((c) => c.id === changes.calendarId)
      ) {
        return { ok: false, error: 'Calendar not found.' };
      }

      const nextType = changes.type ?? existing.type;
      const milestone = isMilestoneType(nextType);
      const nextOriginalDuration = milestone
        ? 0
        : Math.round(changes.originalDuration ?? existing.originalDuration);
      const nextRemainingDuration = milestone
        ? 0
        : Math.round(changes.remainingDuration ?? existing.remainingDuration);

      const updated: ScheduleActivity = {
        ...existing,
        ...changes,
        code: nextCode,
        name: nextName,
        type: nextType,
        originalDuration: nextOriginalDuration,
        remainingDuration: nextRemainingDuration,
      };

      const changedKeys = Object.keys(changes) as Array<keyof ActivityChanges>;
      const stale = changedKeys.some((key) => key !== 'name' && key !== 'notes');

      const forward: Patch[] = [
        { op: 'set', collection: 'activities', id: existing.id, value: updated },
      ];
      const inverse: Patch[] = [
        { op: 'set', collection: 'activities', id: existing.id, value: existing },
      ];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale,
        selectId: existing.id,
      };
    }

    case 'deleteActivities': {
      const idSet = new Set(command.activityIds);
      const removedActivities: Array<{ index: number; value: ScheduleActivity }> = [];
      for (let i = 0; i < document.activities.length; i++) {
        const act = document.activities[i]!;
        if (idSet.has(act.id)) {
          removedActivities.push({ index: i, value: act });
        }
      }
      if (removedActivities.length === 0) {
        return { ok: false, error: 'Activity not found.' };
      }

      const removedActivityIds = new Set(removedActivities.map((item) => item.value.id));
      const removedRelationships: Array<{ index: number; value: ScheduleRelationship }> = [];
      for (let i = 0; i < document.relationships.length; i++) {
        const rel = document.relationships[i]!;
        if (removedActivityIds.has(rel.predecessorId) || removedActivityIds.has(rel.successorId)) {
          removedRelationships.push({ index: i, value: rel });
        }
      }

      const forward: Patch[] = [
        ...removedRelationships.map(({ value }): Patch => ({
          op: 'remove',
          collection: 'relationships',
          id: value.id,
        })),
        ...removedActivities.map(({ value }): Patch => ({
          op: 'remove',
          collection: 'activities',
          id: value.id,
        })),
      ];

      // Restore in ascending original index order so every item returns to its exact slot.
      const inverse: Patch[] = [
        ...removedActivities.map(({ index, value }): Patch => ({
          op: 'insert',
          collection: 'activities',
          index,
          value,
        })),
        ...removedRelationships.map(({ index, value }): Patch => ({
          op: 'insert',
          collection: 'relationships',
          index,
          value,
        })),
      ];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: true,
        selectId: null,
      };
    }

    case 'moveActivity': {
      const existing = document.activities.find((a) => a.id === command.activityId);
      if (!existing) {
        return { ok: false, error: 'Activity not found.' };
      }
      if (command.wbsId !== null && !document.wbs.some((w) => w.id === command.wbsId)) {
        return { ok: false, error: 'WBS element not found.' };
      }

      const updated: ScheduleActivity = {
        ...existing,
        wbsId: command.wbsId,
        order: command.order,
      };
      const forward: Patch[] = [
        { op: 'set', collection: 'activities', id: existing.id, value: updated },
      ];
      const inverse: Patch[] = [
        { op: 'set', collection: 'activities', id: existing.id, value: existing },
      ];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: false,
        selectId: existing.id,
      };
    }

    case 'addWbsNode': {
      if (command.parentId !== null && !document.wbs.some((w) => w.id === command.parentId)) {
        return { ok: false, error: 'Parent WBS element not found.' };
      }

      const afterIndex = command.afterWbsId
        ? document.wbs.findIndex((w) => w.id === command.afterWbsId)
        : -1;
      const insertIndex = afterIndex !== -1 ? afterIndex + 1 : document.wbs.length;
      const siblings = document.wbs.filter((w) => w.parentId === command.parentId);
      const order = computeNextOrder(siblings, command.afterWbsId);

      const node: ScheduleWbsNode = {
        id: newId(),
        parentId: command.parentId,
        code: generateNextWbsCode(document.wbs, command.parentId),
        name: 'New WBS',
        order,
      };

      const forward: Patch[] = [
        { op: 'insert', collection: 'wbs', index: insertIndex, value: node },
      ];
      const inverse: Patch[] = [{ op: 'remove', collection: 'wbs', id: node.id }];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: false,
        selectId: node.id,
      };
    }

    case 'updateWbsNode': {
      const existing = document.wbs.find((w) => w.id === command.wbsId);
      if (!existing) {
        return { ok: false, error: 'WBS element not found.' };
      }

      let nextCode = existing.code;
      if (command.changes.code !== undefined) {
        const trimmed = command.changes.code.trim();
        if (trimmed.length === 0 || trimmed.length > MAX_CODE_LENGTH) {
          return { ok: false, error: 'Enter a WBS code.' };
        }
        nextCode = trimmed;
      }

      let nextName = existing.name;
      if (command.changes.name !== undefined) {
        const trimmed = command.changes.name.trim();
        if (trimmed.length === 0) {
          return { ok: false, error: 'Enter a WBS name.' };
        }
        nextName = trimmed;
      }

      const updated: ScheduleWbsNode = {
        ...existing,
        code: nextCode,
        name: nextName,
      };

      const forward: Patch[] = [{ op: 'set', collection: 'wbs', id: existing.id, value: updated }];
      const inverse: Patch[] = [{ op: 'set', collection: 'wbs', id: existing.id, value: existing }];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: false,
        selectId: existing.id,
      };
    }

    case 'deleteWbsNode': {
      const index = document.wbs.findIndex((w) => w.id === command.wbsId);
      if (index === -1) {
        return { ok: false, error: 'WBS element not found.' };
      }
      const hasChildWbs = document.wbs.some((w) => w.parentId === command.wbsId);
      const hasActivities = document.activities.some((a) => a.wbsId === command.wbsId);
      if (hasChildWbs || hasActivities) {
        return {
          ok: false,
          error: 'Move or delete the items inside this WBS element first.',
        };
      }

      const existing = document.wbs[index]!;
      const forward: Patch[] = [{ op: 'remove', collection: 'wbs', id: existing.id }];
      const inverse: Patch[] = [{ op: 'insert', collection: 'wbs', index, value: existing }];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: false,
        selectId: null,
      };
    }

    case 'addRelationship': {
      if (command.predecessorId === command.successorId) {
        return { ok: false, error: "An activity can't link to itself." };
      }
      const predExists = document.activities.some((a) => a.id === command.predecessorId);
      const succExists = document.activities.some((a) => a.id === command.successorId);
      if (!predExists || !succExists) {
        return { ok: false, error: 'Activity not found.' };
      }
      if (document.relationships.length >= MAX_SCHEDULE_RELATIONSHIPS) {
        return { ok: false, error: 'Maximum relationship limit reached.' };
      }

      const duplicate = document.relationships.some(
        (r) =>
          r.predecessorId === command.predecessorId &&
          r.successorId === command.successorId &&
          r.type === command.relType,
      );
      if (duplicate) {
        return { ok: false, error: 'This relationship already exists.' };
      }

      const relationship: ScheduleRelationship = {
        id: newId(),
        predecessorId: command.predecessorId,
        successorId: command.successorId,
        type: command.relType,
        lagMinutes: Math.round(command.lagMinutes),
        lagElapsed: command.lagElapsed,
      };

      const forward: Patch[] = [
        {
          op: 'insert',
          collection: 'relationships',
          index: document.relationships.length,
          value: relationship,
        },
      ];
      const inverse: Patch[] = [{ op: 'remove', collection: 'relationships', id: relationship.id }];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: true,
        selectId: command.successorId,
      };
    }

    case 'updateRelationship': {
      const existing = document.relationships.find((r) => r.id === command.relationshipId);
      if (!existing) {
        return { ok: false, error: 'Relationship not found.' };
      }

      const nextType = command.changes.type ?? existing.type;
      const duplicate = document.relationships.some(
        (r) =>
          r.id !== existing.id &&
          r.predecessorId === existing.predecessorId &&
          r.successorId === existing.successorId &&
          r.type === nextType,
      );
      if (duplicate) {
        return { ok: false, error: 'This relationship already exists.' };
      }

      const updated: ScheduleRelationship = {
        ...existing,
        type: nextType,
        lagMinutes:
          command.changes.lagMinutes !== undefined
            ? Math.round(command.changes.lagMinutes)
            : existing.lagMinutes,
        lagElapsed: command.changes.lagElapsed ?? existing.lagElapsed,
      };

      const forward: Patch[] = [
        { op: 'set', collection: 'relationships', id: existing.id, value: updated },
      ];
      const inverse: Patch[] = [
        { op: 'set', collection: 'relationships', id: existing.id, value: existing },
      ];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: true,
        selectId: existing.successorId,
      };
    }

    case 'deleteRelationship': {
      const index = document.relationships.findIndex((r) => r.id === command.relationshipId);
      if (index === -1) {
        return { ok: false, error: 'Relationship not found.' };
      }
      const existing = document.relationships[index]!;
      const forward: Patch[] = [{ op: 'remove', collection: 'relationships', id: existing.id }];
      const inverse: Patch[] = [
        { op: 'insert', collection: 'relationships', index, value: existing },
      ];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale: true,
        selectId: null,
      };
    }

    case 'updateScheduleSettings': {
      const nextSettings: ScheduleSettings = {
        ...document.settings,
        ...command.changes,
      };

      const stale = CALCULATION_SETTING_KEYS.some((key) => {
        if (!(key in command.changes)) return false;
        return JSON.stringify(document.settings[key]) !== JSON.stringify(nextSettings[key]);
      });

      const forward: Patch[] = [{ op: 'settings', value: nextSettings }];
      const inverse: Patch[] = [{ op: 'settings', value: document.settings }];

      return {
        ok: true,
        document: applyPatches(document, forward),
        forward,
        inverse,
        stale,
        selectId: null,
      };
    }
  }
}

export function emptyHistory(): EditHistory {
  return { past: [], future: [] };
}

export function record(history: EditHistory, item: HistoryItem): EditHistory {
  const nextPast =
    history.past.length >= HISTORY_LIMIT
      ? [...history.past.slice(history.past.length - HISTORY_LIMIT + 1), item]
      : [...history.past, item];
  return { past: nextPast, future: [] };
}

export function undo(
  document: ScheduleDocument,
  history: EditHistory,
): { document: ScheduleDocument; history: EditHistory } | null {
  if (history.past.length === 0) return null;
  const item = history.past[history.past.length - 1]!;
  return {
    document: applyPatches(document, item.inverse),
    history: {
      past: history.past.slice(0, -1),
      future: [item, ...history.future],
    },
  };
}

export function redo(
  document: ScheduleDocument,
  history: EditHistory,
): { document: ScheduleDocument; history: EditHistory } | null {
  if (history.future.length === 0) return null;
  const item = history.future[0]!;
  return {
    document: applyPatches(document, item.forward),
    history: {
      past: [...history.past, item],
      future: history.future.slice(1),
    },
  };
}
