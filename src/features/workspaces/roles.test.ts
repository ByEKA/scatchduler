import { expect, it } from 'vitest';
import { canEdit, isOwner, ROLE_DESCRIPTIONS } from '@/features/workspaces/roles';

it('derives what a role may do', () => {
  expect([
    canEdit({ myRole: 'owner' }),
    canEdit({ myRole: 'editor' }),
    canEdit({ myRole: 'viewer' }),
    canEdit(undefined),
  ]).toEqual([true, true, false, true]);
  expect([isOwner({ myRole: 'owner' }), isOwner({ myRole: 'editor' }), isOwner(null)]).toEqual([
    true,
    false,
    false,
  ]);
  expect(ROLE_DESCRIPTIONS).toEqual({
    owner: 'Manages members and settings',
    editor: 'Creates and edits projects and schedules',
    viewer: 'Can view everything but change nothing',
  });
});
