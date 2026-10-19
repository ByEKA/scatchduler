// The `DataRepository` contract (P2 spec §9): every adapter runs this suite through its own
// fixture, over data from the same seed definition, so all of them keep the same behaviors.
// Generated values (IDs, emails, the trial end) come from the fixture; names and titles are the
// seed's.
import { describe, expect, it } from 'vitest';
import type { DataRepository } from '@/data/repository';
import type { ID, ISODateTime } from '@/data/types';
import { makeNewProjectInput } from '@/test/fakes';

/** The seed scenario a fixture starts from (Phase 1 spec §5.6). */
export type ContractScenario = 'default' | 'empty';

export interface ContractUser {
  id: ID;
  email: string;
  firstName: string;
  lastName: string;
}

/** What a test asks of its fixture; `scenario` is `'default'` when left out. */
export interface FixtureOptions {
  scenario?: ContractScenario;
}

/**
 * A repository signed in as the seed's current user (Deniz Kaya) over fresh seed data, plus the
 * IDs and values that seed generated. `mert`, `elif` and `team` are `null` in the empty scenario.
 */
export interface RepositoryFixture {
  repository: DataRepository;
  users: { current: ContractUser; mert: ContractUser | null; elif: ContractUser | null };
  workspaces: { personal: ID; team: ID | null };
  projectIds: Record<string, ID>; // by code: '001'…'006', 'T-01'
  trialEndsAt: ISODateTime;
}

/** Builds a new fixture for every call, so each test starts from its own seed data. */
export type MakeRepositoryFixture = (options?: FixtureOptions) => Promise<RepositoryFixture>;

const unknownIds = () => [crypto.randomUUID(), 'not-a-uuid'];

export function runRepositoryContract(label: string, makeFixture: MakeRepositoryFixture): void {
  describe(`DataRepository contract — ${label}`, () => {
    it('returns the current user and the trial', async () => {
      const f = await makeFixture();
      expect(await f.repository.getCurrentUser()).toMatchObject({
        id: f.users.current.id,
        firstName: 'Deniz',
        lastName: 'Kaya',
        email: f.users.current.email,
      });
      expect(await f.repository.getSubscription()).toEqual({
        plan: 'trial',
        trialEndsAt: f.trialEndsAt,
      });
    });

    it('lists workspaces personal first, then teams by name, with project counts', async () => {
      const f = await makeFixture();
      await f.repository.createTeamWorkspace({ name: '  alpha crew ' });
      expect(
        (await f.repository.listWorkspaces()).map((w) => [w.name, w.kind, w.projectCount]),
      ).toEqual([
        ['My workspace', 'personal', 6],
        ['alpha crew', 'team', 0],
        ['Site Operations', 'team', 1],
      ]);
    });

    it('lists projects newest first with schedule counts and limits recent ones', async () => {
      const f = await makeFixture();
      expect(
        (await f.repository.listProjects(f.workspaces.personal)).map((p) => [
          p.code,
          p.scheduleCount,
        ]),
      ).toEqual([
        ['001', 1],
        ['002', 0],
        ['003', 3],
        ['004', 2],
        ['005', 1],
        ['006', 0],
      ]);
      expect(
        (await f.repository.listRecentProjects(f.workspaces.personal, 5)).map((p) => p.code),
      ).toEqual(['001', '002', '003', '004', '005']);
      for (const id of unknownIds()) expect(await f.repository.listProjects(id)).toEqual([]);
    });

    it('checks project IDs trimmed, case-insensitively and literally', async () => {
      const f = await makeFixture();
      const ws = f.workspaces.personal;
      expect(await f.repository.isProjectCodeAvailable(ws, ' 001 ')).toBe(false);
      expect(await f.repository.isProjectCodeAvailable(ws, 'ABC')).toBe(true);
      await f.repository.createProject(makeNewProjectInput(ws, { code: 'abc', name: 'Pier 9' }));
      expect(await f.repository.isProjectCodeAvailable(ws, 'ABC')).toBe(false);
      await expect(
        f.repository.createProject(makeNewProjectInput(ws, { code: 'ABC', name: 'Duplicate' })),
      ).rejects.toMatchObject({
        code: 'conflict',
        message: 'This ID is already used in this workspace',
      });
      await f.repository.createProject(
        makeNewProjectInput(ws, { code: 'A_1', name: 'Underscore' }),
      );
      expect(await f.repository.isProjectCodeAvailable(ws, 'AB1')).toBe(true);
    });

    it('trims input, stores empty optionals as null and keeps the cover image', async () => {
      const f = await makeFixture();
      const created = await f.repository.createProject(
        makeNewProjectInput(f.workspaces.personal, {
          code: '007',
          name: '  Pier 9  ',
          description: '',
          coverImage: new File(['png'], 'cover.png', { type: 'image/png' }),
        }),
      );
      expect(created).toMatchObject({ name: 'Pier 9', description: null });
      expect(created.coverImageUrl).toEqual(expect.any(String));
    });

    it('moves a project to the top of recent projects when a schedule is added', async () => {
      const f = await makeFixture();
      const before = (await f.repository.listProjects(f.workspaces.personal)).find(
        (p) => p.code === '006',
      )!;
      const schedule = await f.repository.createSchedule({
        projectId: f.projectIds['006']!,
        name: 'Baseline',
      });
      expect(schedule).toMatchObject({
        source: 'blank',
        sourceFileName: null,
        statusDate: before.statusDate,
      });
      expect((await f.repository.listRecentProjects(f.workspaces.personal, 5))[0]).toMatchObject({
        code: '006',
        scheduleCount: 1,
      });
    });

    it('records imported schedules and rejects unknown projects', async () => {
      const f = await makeFixture();
      const imported = await f.repository.importSchedule({
        projectId: f.projectIds['002']!,
        name: 'Rev 7',
        file: new File(['x'], 'rev7.XER'),
      });
      expect(imported).toMatchObject({ source: 'import', sourceFileName: 'rev7.XER' });
      for (const id of unknownIds()) {
        await expect(
          f.repository.createSchedule({ projectId: id, name: 'X' }),
        ).rejects.toMatchObject({ code: 'not_found', message: 'Project not found' });
      }
    });

    it('lists schedules shared with me newest first', async () => {
      const f = await makeFixture();
      expect(
        (await f.repository.listSharedWithMe()).map((r) => [
          r.scheduleName,
          r.sharedBy.firstName,
          r.projectName,
        ]),
      ).toEqual([
        ['Baseline rev. 3', 'Mert', 'Tunnel Ventilation Upgrade'],
        ['Look-ahead W42', 'Elif', 'Tunnel Ventilation Upgrade'],
      ]);
    });

    it('orders pending tasks by due date, undated last, and toggles them', async () => {
      const f = await makeFixture();
      const tasks = await f.repository.listPendingTasks();
      expect(tasks.map((t) => t.title)).toEqual([
        'Update status date for Riverside Office Tower',
        'Import revised baseline from contractor',
        'Review look-ahead schedule',
      ]);
      await f.repository.setTaskDone(tasks[0]!.id, true);
      expect(await f.repository.listPendingTasks()).toHaveLength(2);
      await f.repository.setTaskDone(tasks[0]!.id, false);
      expect(await f.repository.listPendingTasks()).toHaveLength(3);
      for (const id of unknownIds()) {
        await expect(f.repository.setTaskDone(id, true)).rejects.toMatchObject({
          code: 'not_found',
          message: 'Task not found',
        });
      }
    });

    it('has only the personal workspace in the empty scenario', async () => {
      const f = await makeFixture({ scenario: 'empty' });
      expect((await f.repository.listWorkspaces()).map((w) => w.kind)).toEqual(['personal']);
      expect(await f.repository.listSharedWithMe()).toEqual([]);
      expect(await f.repository.listPendingTasks()).toEqual([]);
    });
  });
}
