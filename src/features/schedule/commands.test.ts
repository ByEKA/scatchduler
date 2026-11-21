import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  applyPatches,
  emptyHistory,
  HISTORY_LIMIT,
  record,
  redo,
  undo,
} from '@/features/schedule/commands';
import { makeActivity, makeDocument, makeRelationship } from '@/engine/testing';

describe('schedule commands and Undo/Redo (S12)', () => {
  it('auto-generates next code on addActivity and cascades relationships on delete with exact Undo/Redo', () => {
    const start = makeDocument({
      activities: [makeActivity({ id: 'a1', code: 'A1010' })],
      relationships: [],
    });
    const added = applyCommand(
      start,
      { type: 'addActivity', wbsId: null, afterActivityId: 'a1' },
      () => 'a2',
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.document.activities[1]).toMatchObject({
      id: 'a2',
      code: 'A1020',
      originalDuration: 2400,
      remainingDuration: 2400,
    });
    expect(added.stale).toBe(true);
    expect(added.selectId).toBe('a2');

    const linked = applyCommand(
      added.document,
      {
        type: 'addRelationship',
        predecessorId: 'a1',
        successorId: 'a2',
        relType: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      },
      () => 'r1',
    );
    expect(linked.ok).toBe(true);
    if (!linked.ok) return;

    const deleted = applyCommand(linked.document, {
      type: 'deleteActivities',
      activityIds: ['a2'],
    });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.document.activities).toHaveLength(1);
    expect(deleted.document.relationships).toHaveLength(0);

    // JSON-serializable forward/inverse patches (S12)
    const serializedForward = JSON.parse(JSON.stringify(deleted.forward));
    expect(applyPatches(linked.document, serializedForward)).toEqual(deleted.document);

    const history = record(emptyHistory(), {
      command: { type: 'deleteActivities', activityIds: ['a2'] },
      forward: deleted.forward,
      inverse: deleted.inverse,
    });
    const undone = undo(deleted.document, history)!;
    expect(undone.document).toEqual(linked.document);
    const redone = redo(undone.document, undone.history)!;
    expect(redone.document).toEqual(deleted.document);
  });

  it('enforces spec validation copy on self-links, duplicates, and non-empty WBS deletes', () => {
    const doc = makeDocument({
      wbs: [{ id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 }],
      activities: [
        makeActivity({ id: 'a1', code: 'A10', wbsId: 'w1' }),
        makeActivity({ id: 'a2', code: 'A20', wbsId: 'w1' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS' }),
      ],
    });
    expect(
      applyCommand(doc, {
        type: 'addRelationship',
        predecessorId: 'a1',
        successorId: 'a1',
        relType: 'FS',
        lagMinutes: 0,
        lagElapsed: false,
      }),
    ).toEqual({ ok: false, error: "An activity can't link to itself." });
    expect(
      applyCommand(doc, {
        type: 'addRelationship',
        predecessorId: 'a1',
        successorId: 'a2',
        relType: 'FS',
        lagMinutes: 480,
        lagElapsed: false,
      }),
    ).toEqual({ ok: false, error: 'This relationship already exists.' });
    expect(applyCommand(doc, { type: 'deleteWbsNode', wbsId: 'w1' })).toEqual({
      ok: false,
      error: 'Move or delete the items inside this WBS element first.',
    });
  });

  it('validates updateActivity fields, milestone zero duration, and stale flag semantics', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a1', code: 'A1010', name: 'Excavation', originalDuration: 2400, remainingDuration: 2400 }),
        makeActivity({ id: 'a2', code: 'A1020', name: 'Pour' }),
      ],
    });

    expect(
      applyCommand(doc, { type: 'updateActivity', activityId: 'a1', changes: { code: '   ' } }),
    ).toEqual({ ok: false, error: 'Enter an activity code.' });

    expect(
      applyCommand(doc, { type: 'updateActivity', activityId: 'a1', changes: { code: 'a1020' } }),
    ).toEqual({ ok: false, error: 'This activity code is already used.' });

    expect(
      applyCommand(doc, { type: 'updateActivity', activityId: 'a1', changes: { name: '  ' } }),
    ).toEqual({ ok: false, error: 'Enter an activity name.' });

    expect(
      applyCommand(doc, { type: 'updateActivity', activityId: 'a1', changes: { originalDuration: -60 } }),
    ).toEqual({ ok: false, error: "Duration can't be negative." });

    const nameOnly = applyCommand(doc, {
      type: 'updateActivity',
      activityId: 'a1',
      changes: { name: 'Deep excavation', notes: 'Updated note' },
    });
    expect(nameOnly.ok).toBe(true);
    if (!nameOnly.ok) return;
    expect(nameOnly.stale).toBe(false);

    const milestone = applyCommand(nameOnly.document, {
      type: 'updateActivity',
      activityId: 'a1',
      changes: { type: 'finish_milestone', originalDuration: 960 },
    });
    expect(milestone.ok).toBe(true);
    if (!milestone.ok) return;
    expect(milestone.stale).toBe(true);
    expect(milestone.document.activities[0]).toMatchObject({
      type: 'finish_milestone',
      originalDuration: 0,
      remainingDuration: 0,
    });
  });

  it('handles WBS add/update/delete, moveActivity, relationship update/delete, and settings stale rules', () => {
    const doc = makeDocument({
      wbs: [{ id: 'w1', parentId: null, code: '1', name: 'Phase 1', order: 0 }],
      activities: [
        makeActivity({ id: 'a1', code: 'A1010', wbsId: 'w1', order: 0 }),
        makeActivity({ id: 'a2', code: 'A1020', wbsId: 'w1', order: 1 }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2', type: 'FS', lagMinutes: 0 }),
      ],
    });

    const addedWbs = applyCommand(
      doc,
      { type: 'addWbsNode', parentId: 'w1', afterWbsId: 'w1' },
      () => 'w2',
    );
    expect(addedWbs.ok).toBe(true);
    if (!addedWbs.ok) return;
    expect(addedWbs.stale).toBe(false);
    expect(addedWbs.document.wbs[1]).toMatchObject({ id: 'w2', parentId: 'w1', code: '1.1' });

    // Parent cannot be deleted while child WBS exists
    expect(applyCommand(addedWbs.document, { type: 'deleteWbsNode', wbsId: 'w1' })).toEqual({
      ok: false,
      error: 'Move or delete the items inside this WBS element first.',
    });

    const moved = applyCommand(addedWbs.document, {
      type: 'moveActivity',
      activityId: 'a2',
      wbsId: 'w2',
      order: 0,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.stale).toBe(false);
    expect(moved.document.activities[1]).toMatchObject({ wbsId: 'w2', order: 0 });

    const renamedWbs = applyCommand(moved.document, {
      type: 'updateWbsNode',
      wbsId: 'w2',
      changes: { name: 'Substructure' },
    });
    expect(renamedWbs.ok).toBe(true);
    if (!renamedWbs.ok) return;
    expect(renamedWbs.document.wbs[1]?.name).toBe('Substructure');

    // Empty WBS node can be deleted once emptied
    const movedBack = applyCommand(renamedWbs.document, {
      type: 'moveActivity',
      activityId: 'a2',
      wbsId: 'w1',
      order: 1,
    });
    expect(movedBack.ok).toBe(true);
    if (!movedBack.ok) return;

    const deletedWbs = applyCommand(movedBack.document, { type: 'deleteWbsNode', wbsId: 'w2' });
    expect(deletedWbs.ok).toBe(true);
    if (!deletedWbs.ok) return;
    expect(deletedWbs.document.wbs).toHaveLength(1);

    const updatedRel = applyCommand(deletedWbs.document, {
      type: 'updateRelationship',
      relationshipId: 'r1',
      changes: { type: 'SS', lagMinutes: 480 },
    });
    expect(updatedRel.ok).toBe(true);
    if (!updatedRel.ok) return;
    expect(updatedRel.stale).toBe(true);
    expect(updatedRel.document.relationships[0]).toMatchObject({ type: 'SS', lagMinutes: 480 });

    const deletedRel = applyCommand(updatedRel.document, {
      type: 'deleteRelationship',
      relationshipId: 'r1',
    });
    expect(deletedRel.ok).toBe(true);
    if (!deletedRel.ok) return;
    expect(deletedRel.document.relationships).toHaveLength(0);

    const displayOnly = applyCommand(deletedRel.document, {
      type: 'updateScheduleSettings',
      changes: { displayMode: 'calculated', autoCalculate: true },
    });
    expect(displayOnly.ok).toBe(true);
    if (!displayOnly.ok) return;
    expect(displayOnly.stale).toBe(false);

    const profileChange = applyCommand(displayOnly.document, {
      type: 'updateScheduleSettings',
      changes: { profile: 'msp' },
    });
    expect(profileChange.ok).toBe(true);
    if (!profileChange.ok) return;
    expect(profileChange.stale).toBe(true);
  });

  it('bounds history at HISTORY_LIMIT (100) and clears future on new record', () => {
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 15; i++) {
      h = record(h, {
        command: { type: 'updateScheduleSettings', changes: { autoCalculate: i % 2 === 0 } },
        forward: [],
        inverse: [],
      });
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);

    const doc = makeDocument();
    const undone = undo(doc, h)!;
    expect(undone.history.past).toHaveLength(HISTORY_LIMIT - 1);
    expect(undone.history.future).toHaveLength(1);

    const cleared = record(undone.history, {
      command: { type: 'updateScheduleSettings', changes: { autoCalculate: true } },
      forward: [],
      inverse: [],
    });
    expect(cleared.future).toHaveLength(0);
    expect(redo(doc, cleared)).toBeNull();
    expect(undo(doc, emptyHistory())).toBeNull();
  });

  it('restores multiple deleted activities and relationships at their exact original indices', () => {
    const doc = makeDocument({
      activities: [
        makeActivity({ id: 'a1', code: 'A1010' }),
        makeActivity({ id: 'a2', code: 'A1020' }),
        makeActivity({ id: 'a3', code: 'A1030' }),
        makeActivity({ id: 'a4', code: 'A1040' }),
      ],
      relationships: [
        makeRelationship({ id: 'r1', predecessorId: 'a1', successorId: 'a2' }),
        makeRelationship({ id: 'r2', predecessorId: 'a1', successorId: 'a3' }),
        makeRelationship({ id: 'r3', predecessorId: 'a3', successorId: 'a4' }),
      ],
    });

    const deleted = applyCommand(doc, { type: 'deleteActivities', activityIds: ['a4', 'a2'] });
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) return;
    expect(deleted.document.activities.map((a) => a.id)).toEqual(['a1', 'a3']);
    expect(deleted.document.relationships.map((r) => r.id)).toEqual(['r2']);

    const inverseJson = JSON.parse(JSON.stringify(deleted.inverse));
    expect(applyPatches(deleted.document, inverseJson)).toEqual(doc);
  });
});
