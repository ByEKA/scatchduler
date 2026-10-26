// The Supabase seed loader (P2 spec §9): loads the mock's `seed()` definition into the local stack
// through the admin API, so the local seed (`scripts/seed-local.ts`) and the integration fixture
// start from the same data as the mock. Runs with the secret key (service role), which bypasses
// RLS; it never runs in the app.
import type { SupabaseClient } from '@supabase/supabase-js';
import { seed } from '@/data/mock/seed';
import type { Database } from '@/data/supabase/database.types';
import type { ID, ISODateTime, Role } from '@/data/types';

export interface SeedAccount {
  id: ID;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface LoadedSeed {
  users: { current: SeedAccount; mert: SeedAccount | null; elif: SeedAccount | null };
  workspaces: { personal: ID; team: ID | null };
  projectIds: Record<string, ID>;
  pendingInvitationEmail: string | null;
  trialEndsAt: ISODateTime;
}

/** `('a@x.com', 'k1')` → `'a+k1@x.com'`; without a tag the email stays as it is. */
export function tagEmail(email: string, tag?: string): string {
  if (!tag) return email;
  const at = email.lastIndexOf('@');
  return `${email.slice(0, at)}+${tag}${email.slice(at)}`;
}

/** Throws the Supabase error (with the step's name) or returns the data. */
function check<T>(result: { data: T; error: unknown }, step: string): T {
  if (result.error) {
    const message =
      typeof result.error === 'object' && result.error !== null && 'message' in result.error
        ? String(result.error.message)
        : String(result.error);
    throw new Error(`Seed loader: ${step} failed: ${message}`, { cause: result.error });
  }
  return result.data;
}

/**
 * Loads one copy of the seed. Each user becomes a confirmed account (email tagged with `tag`), so
 * the bootstrap gives it a profile, "My workspace" and a trial; the seed's personal workspace maps
 * onto Deniz's bootstrapped one. Team workspaces, projects, schedules, shares, tasks and the
 * invitation keep the seed's ids, and projects and schedules its timestamps.
 */
export async function loadSeed(
  admin: SupabaseClient<Database>,
  options: {
    scenario: 'default' | 'empty';
    now: Date;
    password: string;
    teamRole?: Role;
    tag?: string;
  },
): Promise<LoadedSeed> {
  const { password, tag } = options;
  const db = seed(options.scenario, options.now, { teamRole: options.teamRole });

  // 1. Accounts. The bootstrap trigger runs on insert, because they are created confirmed.
  const accounts = new Map<ID, SeedAccount>();
  for (const user of db.users) {
    const email = tagEmail(user.email, tag);
    const { user: created } = check<{ user: { id: ID; email?: string } | null }>(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { first_name: user.firstName, last_name: user.lastName },
      }),
      `creating ${email}`,
    );
    if (!created) throw new Error(`Seed loader: creating ${email} returned no user`);
    accounts.set(user.id, {
      id: created.id,
      email: created.email ?? email,
      password,
      firstName: user.firstName,
      lastName: user.lastName,
    });
  }
  const accountOf = (userId: ID): SeedAccount => {
    const account = accounts.get(userId);
    if (!account) throw new Error(`Seed loader: no account for seed user ${userId}`);
    return account;
  };
  const userId = (seedUserId: ID): ID => accountOf(seedUserId).id;
  const current = accountOf(db.currentUserId);

  // 2. The seed's personal workspace is the one the bootstrap created for the current user.
  const personal = check(
    await admin
      .from('workspaces')
      .select('id')
      .eq('created_by', current.id)
      .eq('kind', 'personal')
      .single(),
    'reading the personal workspace',
  );
  if (!personal) throw new Error(`Seed loader: ${current.email} has no personal workspace`);
  const seedPersonal = db.workspaces.find((w) => w.kind === 'personal');
  const workspaceId = (seedWorkspaceId: ID): ID =>
    seedWorkspaceId === seedPersonal?.id ? personal.id : seedWorkspaceId;

  // 3. Team workspaces and their memberships (the bootstrap made the personal ones).
  const teams = db.workspaces.filter((w) => w.kind === 'team');
  if (teams.length > 0) {
    check(
      await admin
        .from('workspaces')
        .insert(
          teams.map((w) => ({ id: w.id, name: w.name, kind: w.kind, created_at: w.createdAt })),
        ),
      'inserting team workspaces',
    );
  }
  const teamIds = new Set(teams.map((w) => w.id));
  const teamMembers = db.members.filter((m) => teamIds.has(m.workspaceId));
  if (teamMembers.length > 0) {
    check(
      await admin.from('workspace_members').insert(
        teamMembers.map((m) => ({
          workspace_id: m.workspaceId,
          user_id: userId(m.userId),
          role: m.role,
          joined_at: m.joinedAt,
        })),
      ),
      'inserting memberships',
    );
  }
  if (db.invitations.length > 0) {
    check(
      await admin.from('workspace_invitations').insert(
        db.invitations.map((i) => ({
          id: i.id,
          workspace_id: workspaceId(i.workspaceId),
          email: tagEmail(i.email, tag),
          role: i.role,
          invited_by: i.invitedById === null ? null : userId(i.invitedById),
          created_at: i.invitedAt,
          accepted_at: i.acceptedAt,
          revoked_at: i.revokedAt,
        })),
      ),
      'inserting invitations',
    );
  }

  // 4. Projects, schedules, shares and tasks.
  if (db.projects.length > 0) {
    check(
      await admin.from('projects').insert(
        db.projects.map((p) => ({
          id: p.id,
          workspace_id: workspaceId(p.workspaceId),
          code: p.code,
          name: p.name,
          description: p.description,
          cover_image_path: null,
          status_date: p.statusDate,
          project_type: p.attributes.projectType,
          start_date: p.attributes.startDate,
          planned_finish_date: p.attributes.plannedFinishDate,
          client_name: p.client.name,
          client_contact_name: p.client.contactName,
          client_contact_email: p.client.contactEmail,
          location_address: p.location.address,
          location_city: p.location.city,
          location_country: p.location.country,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        })),
      ),
      'inserting projects',
    );
  }
  if (db.schedules.length > 0) {
    check(
      await admin.from('schedules').insert(
        db.schedules.map((s) => ({
          id: s.id,
          project_id: s.projectId,
          name: s.name,
          status_date: s.statusDate,
          source: s.source,
          source_file_name: s.sourceFileName,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        })),
      ),
      'inserting schedules',
    );
  }
  if (db.shares.length > 0) {
    check(
      await admin.from('schedule_shares').insert(
        db.shares.map((s) => ({
          id: s.id,
          schedule_id: s.scheduleId,
          shared_by: userId(s.sharedById),
          shared_with: userId(s.sharedWithId),
          shared_at: s.sharedAt,
        })),
      ),
      'inserting shares',
    );
  }
  if (db.tasks.length > 0) {
    check(
      await admin.from('tasks').insert(
        db.tasks.map((t) => ({
          id: t.id,
          assignee_id: current.id,
          project_id: t.projectId,
          title: t.title,
          due_date: t.dueDate,
          done: t.done,
          created_at: t.createdAt,
        })),
      ),
      'inserting tasks',
    );
  }

  // 5. Inserting schedules touched their projects: put the seed's updated_at back. Only rows
  // that changed are updated: the update trigger keeps updated_at only when the statement changes
  // it, and writing the same value would set it to now().
  const stored =
    db.projects.length === 0
      ? []
      : check(
          await admin
            .from('projects')
            .select('id, updated_at')
            .in(
              'id',
              db.projects.map((p) => p.id),
            ),
          'reading project timestamps',
        );
  const storedAt = new Map((stored ?? []).map((row) => [row.id, Date.parse(row.updated_at)]));
  await Promise.all(
    db.projects
      .filter((p) => storedAt.get(p.id) !== Date.parse(p.updatedAt))
      .map(async (p) =>
        check(
          await admin.from('projects').update({ updated_at: p.updatedAt }).eq('id', p.id),
          `resetting updated_at of project ${p.code}`,
        ),
      ),
  );
  const trialEndsAt = db.subscription.trialEndsAt;
  if (trialEndsAt === null) throw new Error('Seed loader: the seed has no trial end');
  check(
    await admin
      .from('subscriptions')
      .update({ trial_ends_at: trialEndsAt })
      .eq('user_id', current.id),
    'setting the trial end',
  );

  const byEmail = (email: string): SeedAccount | null => {
    const user = db.users.find((u) => u.email === email);
    return user ? accountOf(user.id) : null;
  };
  return {
    users: {
      current,
      mert: byEmail('mert.demir@example.com'),
      elif: byEmail('elif.arslan@example.com'),
    },
    workspaces: { personal: personal.id, team: teams[0]?.id ?? null },
    projectIds: Object.fromEntries(db.projects.map((p) => [p.code, p.id])),
    pendingInvitationEmail: (() => {
      const pending = db.invitations.find((i) => i.acceptedAt === null && i.revokedAt === null);
      return pending ? tagEmail(pending.email, tag) : null;
    })(),
    trialEndsAt,
  };
}
