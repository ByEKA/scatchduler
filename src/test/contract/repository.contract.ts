// The `DataRepository` contract (P2 spec §9): every adapter runs this suite through its own
// fixture, over data from the same seed definition, so all of them keep the same behaviors.
// Generated values (IDs, emails, the trial end) come from the fixture; names and titles are the
// seed's.
import { describe, expect, it } from 'vitest';
import type { DataRepository } from '@/data/repository';
import type { ID, ISODateTime, ProjectStatus, Role, Schedule } from '@/data/types';
import { makeNewProjectInput, makeUpdateProjectInput } from '@/test/fakes';

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

    describe('project attributes', () => {
      it('reads the seeded attributes and locations', async () => {
        const f = await makeFixture();
        const projects = await f.repository.listProjects(f.workspaces.personal);
        expect(
          projects.map((p) => [
            p.code,
            p.attributes.status,
            p.attributes.stage,
            p.attributes.projectType,
            p.attributes.sector,
            p.client.name,
            p.location.city,
            p.location.country,
            p.location.latitude,
            p.location.longitude,
          ]),
        ).toEqual([
          [
            '001',
            'active',
            'construction',
            'building',
            'private',
            'Riverside Holding',
            'Istanbul',
            'Türkiye',
            41.0151,
            28.9795,
          ],
          [
            '002',
            'active',
            'preconstruction',
            'transportation',
            'public',
            'City Transit Office',
            'Ankara',
            'Türkiye',
            39.9334,
            32.8597,
          ],
          [
            '003',
            'active',
            'construction',
            'industrial',
            'private',
            'Aegean Ports',
            'Izmir',
            'Türkiye',
            38.4192,
            27.1287,
          ],
          [
            '004',
            'on_hold',
            'construction',
            'building',
            'public',
            'Northfield University',
            'Istanbul',
            'Türkiye',
            null,
            null,
          ],
          [
            '005',
            'completed',
            'completed',
            'infrastructure',
            'public',
            'Regional Roads Office',
            'Bursa',
            'Türkiye',
            40.1828,
            29.0663,
          ],
          [
            '006',
            'active',
            'pursuit',
            'residential',
            'private',
            'Millstone Homes',
            null,
            'Türkiye',
            null,
            null,
          ],
        ]);
        expect((await f.repository.listProjects(f.workspaces.team!))[0]).toMatchObject({
          code: 'T-01',
          attributes: {
            status: 'active',
            stage: 'construction',
            projectType: 'infrastructure',
            sector: 'public',
          },
          client: { name: 'Tunnel Operations Agency' },
          location: { city: 'Istanbul', latitude: 41.0422, longitude: 29.0083 },
        });
      });

      it('creates projects with status, stage, sector and coordinates', async () => {
        const f = await makeFixture();
        const expected = {
          attributes: {
            status: 'on_hold',
            stage: 'pursuit',
            projectType: 'energy',
            sector: 'public_private',
            startDate: '2026-03-01',
            plannedFinishDate: '2027-06-30',
          },
          location: {
            address: null,
            city: 'Konya',
            country: 'Türkiye',
            latitude: 37.8746,
            longitude: -32.4932,
          },
        } as const;
        const created = await f.repository.createProject(
          makeNewProjectInput(f.workspaces.personal, {
            code: '010',
            name: 'Solar Park',
            ...expected,
          }),
        );
        expect(created).toMatchObject(expected);
        expect(
          (await f.repository.listProjects(f.workspaces.personal)).find((p) => p.code === '010'),
        ).toMatchObject(expected);
      });

      it('refuses half coordinates and values outside the lists', async () => {
        const f = await makeFixture();
        const base = makeNewProjectInput(f.workspaces.personal, { code: '011' });
        const invalid = {
          code: 'validation',
          message: "Some values aren't valid. Check the form and try again.",
        };
        await expect(
          f.repository.createProject({
            ...base,
            location: { ...base.location, latitude: 41.0151 },
          }),
        ).rejects.toMatchObject(invalid);
        await expect(
          f.repository.createProject({
            ...base,
            location: { ...base.location, latitude: 91, longitude: 0 },
          }),
        ).rejects.toMatchObject(invalid);
        await expect(
          f.repository.createProject({
            ...base,
            attributes: { ...base.attributes, status: 'paused' as ProjectStatus },
          }),
        ).rejects.toMatchObject(invalid);
        expect(await f.repository.isProjectCodeAvailable(f.workspaces.personal, '011')).toBe(true);
      });
    });

    describe('one project', () => {
      it('gets a project with its summary and refuses unknown ids', async () => {
        const f = await makeFixture();
        expect(await f.repository.getProject(f.projectIds['003']!)).toMatchObject({
          code: '003',
          name: 'Harbor Logistics Hub',
          scheduleCount: 3,
          attributes: { status: 'active', stage: 'construction' },
          location: { city: 'Izmir' },
        });
        for (const id of unknownIds()) {
          await expect(f.repository.getProject(id)).rejects.toMatchObject({
            code: 'not_found',
            message: 'Project not found',
          });
        }
      });

      it('updates details, attributes and coordinates and moves the project up', async () => {
        const f = await makeFixture();
        const before = await f.repository.getProject(f.projectIds['006']!);
        const updated = await f.repository.updateProject(
          makeUpdateProjectInput(before, {
            code: '006B',
            name: '  Old Mill Lofts ',
            description: 'Phase two',
            attributes: {
              status: 'completed',
              stage: 'closeout',
              projectType: 'water',
              sector: 'public',
              startDate: '2026-01-05',
              plannedFinishDate: '2026-12-20',
            },
            client: {
              name: 'Millstone Homes',
              contactName: 'Ayşe Demir',
              contactEmail: 'ayse@example.com',
            },
            location: {
              address: 'Mill Road 4',
              city: 'Eskişehir',
              country: 'Türkiye',
              latitude: 39.7767,
              longitude: 30.5206,
            },
          }),
        );
        expect(updated).toMatchObject({
          code: '006B',
          name: 'Old Mill Lofts',
          description: 'Phase two',
          attributes: {
            status: 'completed',
            stage: 'closeout',
            projectType: 'water',
            sector: 'public',
          },
          client: { contactName: 'Ayşe Demir' },
          location: { city: 'Eskişehir', latitude: 39.7767, longitude: 30.5206 },
        });
        expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
        expect((await f.repository.listRecentProjects(f.workspaces.personal, 1))[0]!.code).toBe(
          '006B',
        );
        expect(await f.repository.getProject(before.id)).toMatchObject({
          name: 'Old Mill Lofts',
          location: { address: 'Mill Road 4' },
        });
      });

      it('keeps the status date when the input leaves it out and refuses a taken code', async () => {
        const f = await makeFixture();
        const project = await f.repository.getProject(f.projectIds['006']!);
        const input = makeUpdateProjectInput(project, { name: 'Old Mill' });
        delete input.statusDate;
        expect(await f.repository.updateProject(input)).toMatchObject({
          name: 'Old Mill',
          statusDate: project.statusDate,
        });
        expect(
          await f.repository.updateProject(
            makeUpdateProjectInput(project, { statusDate: '2026-01-15' }),
          ),
        ).toMatchObject({ statusDate: '2026-01-15' });
        await expect(
          f.repository.updateProject(makeUpdateProjectInput(project, { code: ' 001 ' })),
        ).rejects.toMatchObject({
          code: 'conflict',
          message: 'This ID is already used in this workspace',
        });
      });

      it('replaces, keeps and removes the cover', async () => {
        const f = await makeFixture();
        const project = await f.repository.getProject(f.projectIds['002']!);
        const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'cover.jpg', {
          type: 'image/jpeg',
        });
        const withCover = await f.repository.updateProject(
          makeUpdateProjectInput(project, { cover: jpeg }),
        );
        expect(withCover.coverImageUrl).toEqual(expect.any(String));
        expect(
          (
            await f.repository.updateProject(
              makeUpdateProjectInput(withCover, { name: 'Metro Line 2' }),
            )
          ).coverImageUrl,
        ).toEqual(expect.any(String));
        expect(
          (await f.repository.updateProject(makeUpdateProjectInput(withCover, { cover: 'remove' })))
            .coverImageUrl,
        ).toBeNull();
      });

      it('refuses updates from viewers and of unknown projects', async () => {
        const viewer = await makeFixture({ teamRole: 'viewer' });
        const tunnel = await viewer.repository.getProject(viewer.projectIds['T-01']!);
        await expect(
          viewer.repository.updateProject(makeUpdateProjectInput(tunnel, { name: 'Nope' })),
        ).rejects.toMatchObject({ code: 'forbidden' });
        const f = await makeFixture();
        const riverside = await f.repository.getProject(f.projectIds['001']!);
        for (const id of unknownIds()) {
          await expect(
            f.repository.updateProject({ ...makeUpdateProjectInput(riverside), projectId: id }),
          ).rejects.toMatchObject({
            code: 'not_found',
            message: 'Project not found',
          });
        }
      });
    });

    describe('project deletion', () => {
      it('lets only owners delete a project, with its schedules and their shares', async () => {
        for (const teamRole of ['editor', 'viewer'] as const) {
          const other = await makeFixture({ teamRole });
          await expect(
            other.repository.deleteProject(other.projectIds['T-01']!),
          ).rejects.toMatchObject({ code: 'forbidden' });
        }
        const f = await makeFixture();
        await f.repository.deleteProject(f.projectIds['T-01']!);
        await expect(f.repository.getProject(f.projectIds['T-01']!)).rejects.toMatchObject({
          code: 'not_found',
          message: 'Project not found',
        });
        expect(await f.repository.listProjects(f.workspaces.team!)).toEqual([]);
        expect(await f.repository.listSharedWithMe()).toEqual([]);
        expect((await f.repository.listPendingTasks()).map((t) => t.title)).toContain(
          'Review look-ahead schedule',
        );
      });

      it('refuses deletion to share recipients and of unknown projects', async () => {
        const f = await makeFixture();
        await f.repository.removeMember({
          workspaceId: f.workspaces.team!,
          userId: f.users.current.id,
        });
        await expect(f.repository.deleteProject(f.projectIds['T-01']!)).rejects.toMatchObject({
          code: 'forbidden',
        });
        for (const id of unknownIds()) {
          await expect(f.repository.deleteProject(id)).rejects.toMatchObject({
            code: 'not_found',
            message: 'Project not found',
          });
        }
      });
    });

    describe('schedules of a project', () => {
      const details = (s: Schedule) => ({
        scheduleId: s.id,
        name: s.name,
        code: s.code ?? '',
        statusDate: s.statusDate,
        notes: s.notes,
        baseline: s.baseline,
        updateNumber: s.updateNumber,
      });

      it('lists schedules by status date, newest first and nulls last, then by creation', async () => {
        const f = await makeFixture();
        expect(
          (await f.repository.listSchedules(f.projectIds['004']!)).map((s) => [
            s.code,
            s.isCurrent,
            s.baseline,
            s.archivedAt !== null,
          ]),
        ).toEqual([
          ['RP-01', true, 'none', false],
          ['RP-00', false, 'none', true],
          ['BL-01', false, 'primary', false],
        ]);
        const harbor = f.projectIds['003']!;
        await f.repository.createSchedule({ projectId: harbor, name: 'Update 3', code: 'UP-03' });
        expect((await f.repository.listSchedules(harbor)).map((s) => s.code)).toEqual([
          'UP-03',
          'UP-02',
          'UP-01',
          'BL-01',
        ]);
        const bridge = f.projectIds['005']!;
        const dated = await f.repository.createSchedule({
          projectId: bridge,
          name: 'Dated',
          code: 'D-1',
        });
        await f.repository.updateScheduleDetails({ ...details(dated), statusDate: '2026-01-01' });
        expect((await f.repository.listSchedules(bridge)).map((s) => s.code)).toEqual([
          'D-1',
          'BL-01',
        ]);
        for (const id of unknownIds()) expect(await f.repository.listSchedules(id)).toEqual([]);
      });

      it('makes the first schedule of a project current and counts archived schedules apart', async () => {
        const f = await makeFixture();
        const mill = f.projectIds['006']!;
        const first = await f.repository.createSchedule({
          projectId: mill,
          name: 'First',
          code: 'S01',
        });
        const imported = await f.repository.importSchedule({
          projectId: mill,
          name: 'Rev',
          code: 'R1',
          file: new File(['x'], 'rev.XML'),
        });
        expect(first).toMatchObject({
          isCurrent: true,
          baseline: 'none',
          updateNumber: null,
          notes: null,
          archivedAt: null,
          activityCount: 0,
          sourceFormat: null,
          hasImportReport: false,
          hasImportMapping: false,
        });
        expect(imported).toMatchObject({
          isCurrent: false,
          sourceFormat: 'mspdi',
          hasImportReport: false,
        });
        expect(
          (await f.repository.listProjects(f.workspaces.personal)).map((p) => [
            p.code,
            p.scheduleCount,
            p.totalScheduleCount,
            p.currentSchedule?.name ?? null,
          ]),
        ).toEqual([
          ['006', 2, 2, 'First'],
          ['001', 1, 1, 'Main schedule'],
          ['002', 0, 0, null],
          ['003', 3, 3, 'Update 2'],
          ['004', 2, 3, 'Recovery plan'],
          ['005', 1, 1, 'Baseline'],
        ]);
      });

      it('makes another schedule current; the project follows its status date and keeps its updatedAt', async () => {
        const f = await makeFixture();
        const harbor = f.projectIds['003']!;
        const before = await f.repository.getProject(harbor);
        const update1 = (await f.repository.listSchedules(harbor)).find((s) => s.code === 'UP-01')!;
        await f.repository.setCurrentSchedule(update1.id);
        const after = await f.repository.listSchedules(harbor);
        expect(after.filter((s) => s.isCurrent).map((s) => s.code)).toEqual(['UP-01']);
        expect(after.find((s) => s.code === 'UP-01')!.updatedAt).toBe(update1.updatedAt);
        expect(await f.repository.getProject(harbor)).toMatchObject({
          statusDate: update1.statusDate,
          currentSchedule: { id: update1.id, name: 'Update 1' },
          updatedAt: before.updatedAt,
        });
      });

      it('refuses to make an archived or unknown schedule current', async () => {
        const f = await makeFixture();
        const draft = (await f.repository.listSchedules(f.projectIds['004']!)).find(
          (s) => s.code === 'RP-00',
        )!;
        await expect(f.repository.setCurrentSchedule(draft.id)).rejects.toMatchObject({
          code: 'validation',
          message: 'Restore this schedule before making it current.',
        });
        for (const id of unknownIds()) {
          await expect(f.repository.setCurrentSchedule(id)).rejects.toMatchObject({
            code: 'validation',
            message: 'Some schedules are no longer available. Refresh and try again.',
          });
        }
      });

      it('saves details, turns the first baseline into the primary one and demotes an old primary', async () => {
        const f = await makeFixture();
        const [main] = await f.repository.listSchedules(f.projectIds['001']!);
        const saved = await f.repository.updateScheduleDetails({
          ...details(main!),
          name: ' Main ',
          code: ' MS-02 ',
          notes: '  Weekly look-ahead  ',
          baseline: 'baseline',
          updateNumber: 4,
        });
        expect(saved).toMatchObject({
          name: 'Main',
          code: 'MS-02',
          notes: 'Weekly look-ahead',
          baseline: 'primary',
          updateNumber: 4,
        });
        expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(main!.updatedAt));
        const harbor = f.projectIds['003']!;
        const before = await f.repository.listSchedules(harbor);
        await f.repository.updateScheduleDetails({
          ...details(before.find((s) => s.code === 'UP-01')!),
          baseline: 'primary',
        });
        const after = await f.repository.listSchedules(harbor);
        expect(after.map((s) => [s.code, s.baseline])).toEqual([
          ['UP-02', 'none'],
          ['UP-01', 'primary'],
          ['BL-01', 'baseline'],
        ]);
        const updatedAt = (list: Schedule[]) =>
          Date.parse(list.find((s) => s.code === 'BL-01')!.updatedAt);
        expect(updatedAt(after)).toBeGreaterThan(updatedAt(before));
      });

      it('refuses a taken code or update number and an empty code', async () => {
        const f = await makeFixture();
        const update2 = (await f.repository.listSchedules(f.projectIds['003']!)).find(
          (s) => s.code === 'UP-02',
        )!;
        await expect(
          f.repository.updateScheduleDetails({ ...details(update2), code: 'up-01' }),
        ).rejects.toMatchObject({
          code: 'conflict',
          message: 'This code is already used in this project.',
        });
        await expect(
          f.repository.updateScheduleDetails({ ...details(update2), updateNumber: 1 }),
        ).rejects.toMatchObject({
          code: 'conflict',
          message: 'This update number is already used in this project.',
        });
        await expect(
          f.repository.updateScheduleDetails({ ...details(update2), code: '  ' }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Enter a schedule code.',
        });
        await expect(
          f.repository.updateScheduleDetails({ ...details(update2), updateNumber: 1000 }),
        ).rejects.toMatchObject({ code: 'validation' });
      });

      it("keeps the project's status date with its current schedule's (R6, R11)", async () => {
        const f = await makeFixture();
        const harbor = await f.repository.getProject(f.projectIds['003']!);
        await expect(
          f.repository.updateProject(makeUpdateProjectInput(harbor, { statusDate: '2026-01-01' })),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'The status date follows the current schedule.',
        });
        const update2 = (await f.repository.listSchedules(harbor.id)).find((s) => s.isCurrent)!;
        await f.repository.updateScheduleDetails({ ...details(update2), statusDate: '2026-02-02' });
        expect(await f.repository.getProject(harbor.id)).toMatchObject({
          statusDate: '2026-02-02',
          updatedAt: harbor.updatedAt,
        });
        const input = makeUpdateProjectInput(harbor, { name: 'Harbor Hub' });
        delete input.statusDate;
        expect(await f.repository.updateProject(input)).toMatchObject({
          name: 'Harbor Hub',
          statusDate: '2026-02-02',
        });
      });

      it('keeps viewers from changing schedules', async () => {
        const f = await makeFixture({ teamRole: 'viewer' });
        const [lookAhead, baseline] = await f.repository.listSchedules(f.projectIds['T-01']!);
        await expect(f.repository.setCurrentSchedule(baseline!.id)).rejects.toMatchObject({
          code: 'forbidden',
        });
        await expect(
          f.repository.updateScheduleDetails({ ...details(lookAhead!), name: 'X' }),
        ).rejects.toMatchObject({ code: 'forbidden' });
      });
    });

    describe('archive and delete', () => {
      it('archives and restores schedules, never the current one', async () => {
        const f = await makeFixture();
        const harbor = f.projectIds['003']!;
        const listed = await f.repository.listSchedules(harbor);
        const update1 = listed.find((s) => s.code === 'UP-01')!;
        const find = async () =>
          (await f.repository.listSchedules(harbor)).find((s) => s.code === 'UP-01')!;
        await f.repository.setSchedulesArchived({ scheduleIds: [update1.id], archived: true });
        const archived = await find();
        expect(archived.archivedAt).toEqual(expect.any(String));
        expect(Date.parse(archived.updatedAt)).toBeGreaterThan(Date.parse(update1.updatedAt));
        expect(await f.repository.getProject(harbor)).toMatchObject({
          scheduleCount: 2,
          totalScheduleCount: 3,
        });
        await f.repository.setSchedulesArchived({ scheduleIds: [update1.id], archived: false });
        expect((await find()).archivedAt).toBeNull();
        await expect(
          f.repository.setSchedulesArchived({
            scheduleIds: [listed.find((s) => s.isCurrent)!.id],
            archived: true,
          }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Make another schedule current before archiving this one.',
        });
      });

      it('checks the size, the project and the existence of a set, all or nothing', async () => {
        const f = await makeFixture();
        const [update2, update1] = await f.repository.listSchedules(f.projectIds['003']!);
        const [recovery] = await f.repository.listSchedules(f.projectIds['004']!);
        const tooMany = Array.from({ length: 501 }, () => crypto.randomUUID());
        await expect(
          f.repository.setSchedulesArchived({ scheduleIds: tooMany, archived: true }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Select 500 schedules or fewer.',
        });
        await expect(
          f.repository.setSchedulesArchived({
            scheduleIds: [update1!.id, recovery!.id],
            archived: true,
          }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Select schedules from one project.',
        });
        await expect(
          f.repository.deleteSchedules([update1!.id, crypto.randomUUID()]),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Some schedules are no longer available. Refresh and try again.',
        });
        await expect(
          f.repository.setSchedulesArchived({
            scheduleIds: [update1!.id, update2!.id],
            archived: true,
          }),
        ).rejects.toMatchObject({
          code: 'validation',
          message: 'Make another schedule current before archiving this one.',
        });
        expect(
          (await f.repository.listSchedules(f.projectIds['003']!)).every(
            (s) => s.archivedAt === null,
          ),
        ).toBe(true);
        await expect(
          f.repository.setSchedulesArchived({ scheduleIds: [], archived: true }),
        ).resolves.toBeUndefined();
      });

      it('deletes schedules as sets, never the current one while others stay', async () => {
        const f = await makeFixture();
        const harbor = f.projectIds['003']!;
        const [update2, update1, baseline] = await f.repository.listSchedules(harbor);
        const keepCurrent = {
          code: 'validation',
          message: 'Make another schedule current before deleting this one.',
        };
        await expect(f.repository.deleteSchedules([update2!.id])).rejects.toMatchObject(
          keepCurrent,
        );
        await expect(
          f.repository.deleteSchedules([update2!.id, update1!.id]),
        ).rejects.toMatchObject(keepCurrent);
        await f.repository.deleteSchedules([baseline!.id]);
        expect((await f.repository.listSchedules(harbor)).map((s) => s.code)).toEqual([
          'UP-02',
          'UP-01',
        ]);
        await f.repository.deleteSchedules([update1!.id, update2!.id]);
        expect(await f.repository.listSchedules(harbor)).toEqual([]);
        expect(await f.repository.getProject(harbor)).toMatchObject({
          scheduleCount: 0,
          totalScheduleCount: 0,
          currentSchedule: null,
        });
        const [, rev3] = await f.repository.listSchedules(f.projectIds['T-01']!);
        await f.repository.deleteSchedules([rev3!.id]);
        expect((await f.repository.listSharedWithMe()).map((r) => r.scheduleName)).toEqual([
          'Look-ahead W42',
        ]);
      });

      it('lets editors archive and only owners delete', async () => {
        const editor = await makeFixture({ teamRole: 'editor' });
        const [, rev3] = await editor.repository.listSchedules(editor.projectIds['T-01']!);
        await expect(editor.repository.deleteSchedules([rev3!.id])).rejects.toMatchObject({
          code: 'forbidden',
        });
        await expect(
          editor.repository.setSchedulesArchived({ scheduleIds: [rev3!.id], archived: true }),
        ).resolves.toBeUndefined();
        const viewer = await makeFixture({ teamRole: 'viewer' });
        const [, viewerRev3] = await viewer.repository.listSchedules(viewer.projectIds['T-01']!);
        await expect(
          viewer.repository.setSchedulesArchived({ scheduleIds: [viewerRev3!.id], archived: true }),
        ).rejects.toMatchObject({ code: 'forbidden' });
        await expect(viewer.repository.deleteSchedules([viewerRev3!.id])).rejects.toMatchObject({
          code: 'forbidden',
        });
      });
    });
  });
}
