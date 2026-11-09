// The `DataRepository` contract (P2 spec §9): every adapter runs this suite through its own
// fixture, over data from the same seed definition, so all of them keep the same behaviors.
// Generated values (IDs, emails, the trial end) come from the fixture; names and titles are the
// seed's.
import { describe, expect, it } from 'vitest';
import type { DataRepository } from '@/data/repository';
import type { ID, ISODateTime, Role } from '@/data/types';
import { makeNewProjectInput } from '@/test/fakes';

/** The seed scenario a fixture starts from (Phase 1 spec §5.6). */
export type ContractScenario = 'default' | 'empty';

export interface ContractUser {
  id: ID;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * What a test asks of its fixture. `scenario` is `'default'` when left out; `teamRole` is the
 * current user's role in Site Operations, `'owner'` when left out (P2 spec §6.4).
 */
export interface FixtureOptions {
  scenario?: ContractScenario;
  teamRole?: Role;
}

/**
 * A repository signed in as the seed's current user (Deniz Kaya) over fresh seed data, plus the
 * IDs and values that seed generated. `mert`, `elif`, `team` and `pendingInvitationEmail` are
 * `null` in the empty scenario.
 */
export interface RepositoryFixture {
  repository: DataRepository;
  users: { current: ContractUser; mert: ContractUser | null; elif: ContractUser | null };
  workspaces: { personal: ID; team: ID | null };
  projectIds: Record<string, ID>; // by code: '001'…'006', 'T-01'
  /** The email of the seed's pending invitation to Site Operations. */
  pendingInvitationEmail: string | null;
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

    it('orders team workspaces in Turkish alphabetical order', async () => {
      const f = await makeFixture();
      await f.repository.createTeamWorkspace({ name: 'Çanakkale crew' });
      await f.repository.createTeamWorkspace({ name: 'Czech crew' });
      expect((await f.repository.listWorkspaces()).map((w) => w.name)).toEqual([
        'My workspace',
        'Czech crew',
        'Çanakkale crew',
        'Site Operations',
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
        code: 'S01',
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
        code: 'REV-7',
        file: new File(['x'], 'rev7.XER'),
      });
      expect(imported).toMatchObject({ source: 'import', sourceFileName: 'rev7.XER' });
      for (const id of unknownIds()) {
        await expect(
          f.repository.createSchedule({ projectId: id, name: 'X', code: 'X' }),
        ).rejects.toMatchObject({ code: 'not_found', message: 'Project not found' });
      }
    });

    it('requires a schedule code that is unique in its project, ignoring case', async () => {
      const f = await makeFixture();
      const riverside = f.projectIds['001']!;
      await expect(
        f.repository.createSchedule({ projectId: riverside, name: 'X', code: '  ' }),
      ).rejects.toMatchObject({
        code: 'validation',
        message: 'Enter a schedule code.',
      });
      await expect(
        f.repository.createSchedule({ projectId: riverside, name: 'X', code: 'a b' }),
      ).rejects.toMatchObject({ code: 'validation' });
      const taken = { code: 'conflict', message: 'This code is already used in this project.' };
      await expect(
        f.repository.createSchedule({ projectId: riverside, name: 'X', code: ' ms-01 ' }),
      ).rejects.toMatchObject(taken);
      await expect(
        f.repository.importSchedule({
          projectId: riverside,
          name: 'X',
          code: 'MS-01',
          file: new File(['x'], 'x.xer'),
        }),
      ).rejects.toMatchObject(taken);
      expect(
        await f.repository.createSchedule({
          projectId: f.projectIds['002']!,
          name: 'X',
          code: ' ms-01 ',
        }),
      ).toMatchObject({ code: 'ms-01' });
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
      expect((await f.repository.listPendingTasks()).map((t) => t.title)).toEqual([
        'Update status date for Riverside Office Tower',
        'Import revised baseline from contractor',
        'Review look-ahead schedule',
      ]);
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

    describe('members and invitations', () => {
      it('reports my role per workspace', async () => {
        const f = await makeFixture({ teamRole: 'viewer' });
        expect((await f.repository.listWorkspaces()).map((w) => [w.name, w.myRole])).toEqual([
          ['My workspace', 'owner'],
          ['Site Operations', 'viewer'],
        ]);
      });

      it('lists members owners first, then by name', async () => {
        const f = await makeFixture();
        expect(
          (await f.repository.listMembers(f.workspaces.team!)).map((m) => [
            `${m.firstName} ${m.lastName}`,
            m.role,
          ]),
        ).toEqual([
          ['Deniz Kaya', 'owner'],
          ['Mert Demir', 'owner'],
          ['Elif Arslan', 'viewer'],
        ]);
      });

      it('lists members by role, then name, for a viewer too', async () => {
        const f = await makeFixture({ teamRole: 'viewer' });
        expect(
          (await f.repository.listMembers(f.workspaces.team!)).map((m) => [
            `${m.firstName} ${m.lastName}`,
            m.role,
          ]),
        ).toEqual([
          ['Mert Demir', 'owner'],
          ['Deniz Kaya', 'viewer'],
          ['Elif Arslan', 'viewer'],
        ]);
      });

      it('shows pending invitations to owners only', async () => {
        const owner = await makeFixture();
        expect(
          (await owner.repository.listInvitations(owner.workspaces.team!)).map((i) => [
            i.email,
            i.role,
          ]),
        ).toEqual([[owner.pendingInvitationEmail, 'editor']]);
        const viewer = await makeFixture({ teamRole: 'viewer' });
        expect(await viewer.repository.listInvitations(viewer.workspaces.team!)).toEqual([]);
      });

      it('invites a new email once, however it is typed', async () => {
        const f = await makeFixture();
        const email = `new.person.${crypto.randomUUID().slice(0, 8)}@example.com`;
        await expect(
          f.repository.inviteMember({
            workspaceId: f.workspaces.team!,
            email: `  ${email.toUpperCase()} `,
            role: 'editor',
          }),
        ).resolves.toEqual({ status: 'invited' });
        await expect(
          f.repository.inviteMember({ workspaceId: f.workspaces.team!, email, role: 'viewer' }),
        ).resolves.toEqual({ status: 'invited' });
        expect(
          (await f.repository.listInvitations(f.workspaces.team!)).map((i) => [i.email, i.role]),
        ).toEqual([
          [email, 'viewer'],
          [f.pendingInvitationEmail, 'editor'],
        ]);
      });

      it('adds an existing account directly and refuses current members', async () => {
        const f = await makeFixture();
        const crew = await f.repository.createTeamWorkspace({ name: 'Field crew' });
        await expect(
          f.repository.inviteMember({
            workspaceId: crew.id,
            email: f.users.mert!.email,
            role: 'editor',
          }),
        ).resolves.toEqual({ status: 'added' });
        expect((await f.repository.listMembers(crew.id)).map((m) => m.email)).toContain(
          f.users.mert!.email,
        );
        const elif = f.users.elif!.email;
        await expect(
          f.repository.inviteMember({
            workspaceId: f.workspaces.team!,
            email: ` ${elif.toUpperCase()}`,
            role: 'editor',
          }),
        ).rejects.toMatchObject({ code: 'conflict', message: `${elif} is already a member.` });
      });

      it('refuses personal workspaces, bad input and non-owners', async () => {
        const f = await makeFixture();
        await expect(
          f.repository.inviteMember({
            workspaceId: f.workspaces.personal,
            email: 'someone@example.com',
            role: 'editor',
          }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Invite people to a team workspace.',
        });
        await expect(
          f.repository.inviteMember({
            workspaceId: f.workspaces.team!,
            email: 'not an email',
            role: 'editor',
          }),
        ).rejects.toMatchObject({ code: 'validation', message: 'Check the email and role.' });
        const editor = await makeFixture({ teamRole: 'editor' });
        await expect(
          editor.repository.inviteMember({
            workspaceId: editor.workspaces.team!,
            email: 'someone@example.com',
            role: 'viewer',
          }),
        ).rejects.toMatchObject({ code: 'forbidden' });
      });

      it('revokes pending invitations', async () => {
        const f = await makeFixture();
        const [invitation] = await f.repository.listInvitations(f.workspaces.team!);
        await f.repository.revokeInvitation(invitation!.id);
        expect(await f.repository.listInvitations(f.workspaces.team!)).toEqual([]);
      });

      it('changes roles and removes members but always keeps an owner', async () => {
        const f = await makeFixture();
        const team = f.workspaces.team!;
        await f.repository.updateMemberRole({
          workspaceId: team,
          userId: f.users.elif!.id,
          role: 'editor',
        });
        await f.repository.updateMemberRole({
          workspaceId: team,
          userId: f.users.mert!.id,
          role: 'viewer',
        });
        const lastOwner = { code: 'validation', message: 'A workspace needs at least one owner.' };
        await expect(
          f.repository.updateMemberRole({
            workspaceId: team,
            userId: f.users.current.id,
            role: 'editor',
          }),
        ).rejects.toMatchObject(lastOwner);
        await expect(
          f.repository.removeMember({ workspaceId: team, userId: f.users.current.id }),
        ).rejects.toMatchObject(lastOwner);
        await f.repository.removeMember({ workspaceId: team, userId: f.users.elif!.id });
        await expect(
          f.repository.removeMember({ workspaceId: team, userId: f.users.elif!.id }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'This person is no longer a member.',
        });
        expect((await f.repository.listMembers(team)).map((m) => [m.email, m.role])).toEqual([
          [f.users.current.email, 'owner'],
          [f.users.mert!.email, 'viewer'],
        ]);
      });

      it('lets only owners manage members', async () => {
        const f = await makeFixture({ teamRole: 'editor' });
        await expect(
          f.repository.updateMemberRole({
            workspaceId: f.workspaces.team!,
            userId: f.users.elif!.id,
            role: 'editor',
          }),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(
          f.repository.removeMember({ workspaceId: f.workspaces.team!, userId: f.users.elif!.id }),
        ).rejects.toMatchObject({ code: 'forbidden' });
      });

      it('lets editors create but not see invitations', async () => {
        const f = await makeFixture({ teamRole: 'editor' });
        const team = f.workspaces.team!;
        await expect(
          f.repository.createProject(makeNewProjectInput(team, { code: 'E-1' })),
        ).resolves.toBeDefined();
        await expect(
          f.repository.createSchedule({
            projectId: f.projectIds['T-01']!,
            name: 'Editor plan',
            code: 'ED-1',
          }),
        ).resolves.toBeDefined();
        expect(await f.repository.listInvitations(team)).toEqual([]);
      });

      it('keeps viewers from creating projects and schedules', async () => {
        const f = await makeFixture({ teamRole: 'viewer' });
        const tunnel = f.projectIds['T-01']!;
        await expect(
          f.repository.createProject(makeNewProjectInput(f.workspaces.team!, { code: 'V-1' })),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(
          f.repository.createSchedule({ projectId: tunnel, name: 'Nope', code: 'NOPE' }),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(
          f.repository.importSchedule({
            projectId: tunnel,
            name: 'Nope',
            code: 'NOPE',
            file: new File(['x'], 'x.xer'),
          }),
        ).rejects.toMatchObject({ code: 'forbidden' });
      });

      it('updates my name', async () => {
        const f = await makeFixture();
        await expect(
          f.repository.updateProfile({ firstName: ' Ada ', lastName: 'Lovelace' }),
        ).resolves.toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
        expect(await f.repository.getCurrentUser()).toMatchObject({
          firstName: 'Ada',
          lastName: 'Lovelace',
        });
      });
    });
  });
}
