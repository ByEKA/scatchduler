import { describe, expect, it } from 'vitest';
import { seed } from '@/data/mock/seed';

const now = new Date('2026-10-14T10:00:00.000Z');

describe('seed', () => {
  it('builds the default scenario', () => {
    const db = seed('default', now);
    expect(db.workspaces.map((w) => [w.name, w.kind])).toEqual([
      ['My workspace', 'personal'],
      ['Site Operations', 'team'],
    ]);
    const personal = db.workspaces[0]!;
    const own = db.projects.filter((p) => p.workspaceId === personal.id);
    expect(own.map((p) => p.code)).toEqual(['001', '002', '003', '004', '005', '006']);
    expect(own.map((p) => db.schedules.filter((s) => s.projectId === p.id).length)).toEqual([
      1, 0, 3, 2, 1, 0,
    ]);
    expect(db.shares).toHaveLength(2);
    expect(db.tasks.map((t) => t.title)).toEqual([
      'Update status date for Riverside Office Tower',
      'Import revised baseline from contractor',
      'Review look-ahead schedule',
    ]);
    expect(db.subscription).toEqual({ plan: 'trial', trialEndsAt: '2026-10-23T10:00:00.000Z' });
    expect(db.session).toEqual({ userId: db.currentUserId });
  });

  it('stores status dates as local calendar dates', () => {
    // 05:00 UTC is 22:00 the evening before in America/Los_Angeles
    const db = seed('default', new Date('2026-10-14T05:00:00.000Z'));
    expect(db.projects.find((p) => p.code === '001')?.statusDate).toBe('2026-10-11');
  });

  it('offsets timestamps by exact milliseconds across a daylight-saving change', () => {
    // Los Angeles leaves daylight time on Nov 1, 2026; addDays would end the trial at 11:00Z.
    expect(seed('default', new Date('2026-10-28T10:00:00.000Z')).subscription.trialEndsAt).toBe(
      '2026-11-06T10:00:00.000Z',
    );
  });

  it('keeps only the user and the personal workspace in the empty scenario', () => {
    const db = seed('empty', now);
    expect(db.users).toHaveLength(1);
    expect(db.workspaces.map((w) => w.kind)).toEqual(['personal']);
    expect([db.projects, db.schedules, db.shares, db.tasks]).toEqual([[], [], [], []]);
  });
});
