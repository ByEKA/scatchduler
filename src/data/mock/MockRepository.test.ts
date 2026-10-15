import { beforeEach, describe, expect, it } from 'vitest';
import { MockRepository } from '@/data/mock/MockRepository';
import { createMockStore, type MockStore } from '@/data/mock/store';
import { createMemoryStorage } from '@/lib/storage';
import { makeNewProjectInput } from '@/test/fakes';

const now = new Date('2026-10-14T10:00:00.000Z');
let store: MockStore;
let repo: MockRepository;
const personalId = () => store.read().workspaces[0]!.id;
const project = (code: string) => store.read().projects.find((p) => p.code === code)!;

beforeEach(() => {
  store = createMockStore({ storage: createMemoryStorage(), scenario: 'default', now: () => now });
  repo = new MockRepository({ store, now: () => now });
});

describe('MockRepository', () => {
  it('returns the current user and subscription', async () => {
    expect(await repo.getCurrentUser()).toMatchObject({
      firstName: 'Deniz',
      lastName: 'Kaya',
      email: 'deniz.kaya@example.com',
    });
    expect(await repo.getSubscription()).toEqual({
      plan: 'trial',
      trialEndsAt: '2026-10-23T10:00:00.000Z',
    });
  });

  it('lists workspaces personal first, then teams by name, with project counts', async () => {
    await repo.createTeamWorkspace({ name: '  Alpha Crew ' });
    expect((await repo.listWorkspaces()).map((w) => [w.name, w.kind, w.projectCount])).toEqual([
      ['My workspace', 'personal', 6],
      ['Alpha Crew', 'team', 0],
      ['Site Operations', 'team', 1],
    ]);
  });

  it('lists projects newest first with schedule counts and limits recent ones', async () => {
    expect((await repo.listProjects(personalId())).map((p) => [p.code, p.scheduleCount])).toEqual([
      ['001', 1],
      ['002', 0],
      ['003', 3],
      ['004', 2],
      ['005', 1],
      ['006', 0],
    ]);
    expect((await repo.listRecentProjects(personalId(), 5)).map((p) => p.code)).toEqual([
      '001',
      '002',
      '003',
      '004',
      '005',
    ]);
    expect(await repo.listProjects('unknown-workspace')).toEqual([]);
  });

  it('checks project IDs case-insensitively and rejects duplicates', async () => {
    expect(await repo.isProjectCodeAvailable(personalId(), ' 001 ')).toBe(false);
    expect(await repo.isProjectCodeAvailable(personalId(), 'ABC')).toBe(true);
    await repo.createProject(makeNewProjectInput(personalId(), { code: 'abc', name: 'Pier 9' }));
    expect(await repo.isProjectCodeAvailable(personalId(), 'ABC')).toBe(false);
    await expect(
      repo.createProject(makeNewProjectInput(personalId(), { code: 'ABC', name: 'Duplicate' })),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: 'This ID is already used in this workspace',
    });
  });

  it('trims input, stores null for empty optionals and encodes the cover image', async () => {
    const created = await repo.createProject(
      makeNewProjectInput(personalId(), {
        code: '007',
        name: '  Pier 9  ',
        description: '',
        coverImage: new File(['png'], 'cover.png', { type: 'image/png' }),
      }),
    );
    expect(created).toMatchObject({
      name: 'Pier 9',
      description: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
    expect(created.coverImageUrl).toMatch(/^data:image\/png;base64,/);
  });

  it('moves a project to the top of recent projects when a schedule is added', async () => {
    const schedule = await repo.createSchedule({ projectId: project('006').id, name: 'Baseline' });
    expect(schedule).toMatchObject({
      source: 'blank',
      sourceFileName: null,
      statusDate: project('006').statusDate,
    });
    expect((await repo.listRecentProjects(personalId(), 5))[0]).toMatchObject({
      code: '006',
      scheduleCount: 1,
      updatedAt: now.toISOString(),
    });
  });

  it('records imported schedules and rejects unknown projects', async () => {
    const imported = await repo.importSchedule({
      projectId: project('002').id,
      name: 'Rev 7',
      file: new File(['x'], 'rev7.XER'),
    });
    expect(imported).toMatchObject({ source: 'import', sourceFileName: 'rev7.XER' });
    await expect(repo.createSchedule({ projectId: 'nope', name: 'X' })).rejects.toMatchObject({
      code: 'not_found',
      message: 'Project not found',
    });
  });

  it('lists schedules shared with me newest first', async () => {
    expect(
      (await repo.listSharedWithMe()).map((r) => [
        r.scheduleName,
        r.sharedBy.firstName,
        r.projectName,
      ]),
    ).toEqual([
      ['Baseline rev. 3', 'Mert', 'Tunnel Ventilation Upgrade'],
      ['Look-ahead W42', 'Elif', 'Tunnel Ventilation Upgrade'],
    ]);
  });

  it('orders pending tasks by due date with undated last, and toggles them', async () => {
    const tasks = await repo.listPendingTasks();
    expect(tasks.map((t) => t.title)).toEqual([
      'Update status date for Riverside Office Tower',
      'Import revised baseline from contractor',
      'Review look-ahead schedule',
    ]);
    await repo.setTaskDone(tasks[0]!.id, true);
    expect(await repo.listPendingTasks()).toHaveLength(2);
    await repo.setTaskDone(tasks[0]!.id, false);
    expect(await repo.listPendingTasks()).toHaveLength(3);
    await expect(repo.setTaskDone('nope', true)).rejects.toMatchObject({
      code: 'not_found',
      message: 'Task not found',
    });
  });

  it('sorts shared rows and pending tasks whatever the stored order', async () => {
    store.write((db) => {
      db.shares.reverse();
      db.tasks.reverse();
      const riverside = db.tasks.find((t) => t.title.startsWith('Update status date'))!;
      db.tasks.find((t) => t.title.startsWith('Import revised'))!.dueDate = riverside.dueDate;
    });
    expect((await repo.listSharedWithMe()).map((r) => r.scheduleName)).toEqual([
      'Baseline rev. 3',
      'Look-ahead W42',
    ]);
    // Same due date: the task created a day earlier comes first.
    expect((await repo.listPendingTasks()).map((t) => t.title)).toEqual([
      'Import revised baseline from contractor',
      'Update status date for Riverside Office Tower',
      'Review look-ahead schedule',
    ]);
  });

  it('sorts team workspaces by English collation whatever the machine locale', async () => {
    await repo.createTeamWorkspace({ name: 'Czech crew' });
    await repo.createTeamWorkspace({ name: 'Çanakkale crew' });
    expect((await repo.listWorkspaces()).map((w) => w.name)).toEqual([
      'My workspace',
      'Çanakkale crew',
      'Czech crew',
      'Site Operations',
    ]);
  });

  it('fails reads but not writes under failure injection', async () => {
    const flaky = new MockRepository({ store, failRate: 1, random: () => 0, now: () => now });
    await expect(flaky.listWorkspaces()).rejects.toMatchObject({ code: 'network' });
    await expect(flaky.createTeamWorkspace({ name: 'Field crew' })).resolves.toMatchObject({
      kind: 'team',
    });
  });
});
