import { describe, expect, it } from 'vitest';
import { seed, type MockDb } from '@/data/mock/seed';

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
      1, 0, 3, 3, 1, 0,
    ]);
    expect(db.shares).toHaveLength(2);
    expect(db.tasks.map((t) => t.title)).toEqual([
      'Update status date for Riverside Office Tower',
      'Import revised baseline from contractor',
      'Review look-ahead schedule',
    ]);
    expect(db.subscription).toEqual({ plan: 'trial', trialEndsAt: '2026-10-23T10:00:00.000Z' });
    expect(db.session).toEqual({ userId: db.currentUserId });
    for (const p of db.projects) {
      const workspace = db.workspaces.find((w) => w.id === p.workspaceId)!;
      expect(p.createdAt >= workspace.createdAt, `${p.code} createdAt`).toBe(true);
    }
  });

  it('gives every seed schedule its code (spec §4.5)', () => {
    const db = seed('default', now);
    const projectCode = (id: string) => db.projects.find((p) => p.id === id)!.code;
    expect(db.schedules.map((s) => [projectCode(s.projectId), s.name, s.code])).toEqual([
      ['001', 'Main schedule', 'MS-01'],
      ['003', 'Baseline', 'BL-01'],
      ['003', 'Update 1', 'UP-01'],
      ['003', 'Update 2', 'UP-02'],
      ['004', 'Baseline', 'BL-01'],
      ['004', 'Recovery plan', 'RP-01'],
      ['004', 'Recovery plan draft', 'RP-00'],
      ['005', 'Baseline', 'BL-01'],
      ['T-01', 'Baseline rev. 3', 'BL-03'],
      ['T-01', 'Look-ahead W42', 'LA-42'],
    ]);
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

  it('seeds members, roles and a pending invitation', () => {
    const db = seed('default', now);
    const team = db.workspaces.find((w) => w.kind === 'team')!;
    const roleOf = (d: MockDb, email: string) => {
      const teamId = d.workspaces.find((w) => w.kind === 'team')!.id;
      return d.members.find(
        (m) => m.workspaceId === teamId && m.userId === d.users.find((u) => u.email === email)!.id,
      )?.role;
    };
    expect(
      ['deniz.kaya@example.com', 'mert.demir@example.com', 'elif.arslan@example.com'].map((e) =>
        roleOf(db, e),
      ),
    ).toEqual(['owner', 'owner', 'viewer']);
    expect(db.invitations).toEqual([
      expect.objectContaining({
        workspaceId: team.id,
        email: 'site.planner@example.com',
        role: 'editor',
        invitedAt: '2026-10-12T10:00:00.000Z',
        acceptedAt: null,
        revokedAt: null,
      }),
    ]);
    expect(roleOf(seed('default', now, { teamRole: 'viewer' }), 'deniz.kaya@example.com')).toBe(
      'viewer',
    );
    expect(seed('empty', now)).toMatchObject({
      invitations: [],
      members: [expect.objectContaining({ role: 'owner' })],
    });
  });
});
