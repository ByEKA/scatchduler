# Phase 2 — Supabase Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Without the superpowers plugin: execute the tasks in order yourself, following each step literally.

**Goal:** Move the app from mock data to Supabase (Postgres + RLS, Auth, Storage, one Edge Function) with invite-only sign-in, members and roles — without changing how components get their data.

**Architecture:** Components keep calling hooks, which call `DataRepository` / `AuthService`. The mock adapter learns roles, members and invitations first, proven by contract suites. Then SQL migrations (tested with pgTAP), the `invitations` Edge Function and the Supabase adapters are built to pass the same suites against a local Supabase stack in Docker. Production runs on Supabase Cloud (Frankfurt) and Cloudflare Pages.

**Tech Stack:** the Phase 1 stack plus `@supabase/supabase-js` v2, the Supabase CLI (dev dependency `supabase`), Postgres with pgTAP, the Deno-based Edge Runtime (provided by the local stack), `tsx`, GitHub Actions and Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md` (the P2 spec). Read it, plus Phase 1 spec §5 and §9, before Task 1. Each task names the P2 spec sections it implements; values in those sections are requirements even when this plan doesn't repeat them. The Phase 1 spec and plan stay valid wherever the P2 spec doesn't replace them.

## Global Constraints

- Phase 1's Global Constraints still hold (TypeScript rules, tokens, copy style, storage helper, lint boundary, QueryClient defaults, `TZ`, one commit per task, the CLI fallback rule). The exception is its env bullet, which P2 spec §4.2 replaces.
- The Supabase secret / service-role key never appears in a `VITE_*` variable, a committed file or a test fixture. Local tooling reads keys at runtime from `supabase status -o json` (`integration/local-stack.ts`).
- Docker must be running for Tasks 1 and 9–17. Tasks 2–8 need no Docker.
- After every task, `npm run check` passes. Tasks that touch SQL also pass `npm run test:db`. Tasks that touch the Supabase adapters or the Edge Function also pass `npm run test:integration`.
- SQL rules (P2 spec §6.6–§7):
  - RLS is enabled on every table, and policies are written `to authenticated`.
  - After the Task 9 revoke, every grant is explicit.
  - Every migration that creates a function ends with `revoke execute on function … from public, anon, authenticated`, then grants only what the task says. PostgreSQL makes new functions executable by `PUBLIC`; Task 9 step 2 explains why no default privilege can prevent that, and `02_privileges` fails on any function left open.
  - Every function parameter starts with `p_`.
  - Definer functions and all trigger functions are `security definer set search_path = ''`, with schema-qualified names.
  - User-facing errors use `raise exception using errcode = 'check_violation', hint = 'app', message = '<copy>'`.
  - Permission errors use `errcode = 'insufficient_privilege'`.
- Migrations:
  - Create them with `npx supabase migration new <name>`.
  - Until the first production push, P2 migrations may be edited in place (then run `npm run db:reset`). After it, only new migrations.
  - Regenerate `src/data/supabase/database.types.ts` with `npm run db:types` in the same commit as any schema change.
- UI copy comes verbatim from P2 spec §5 and §6.1, and from Phase 1 where unchanged. The product name in emails is `AppName` (`src/config/brand.ts`).
- The Google "G" mark is never drawn, embedded or downloaded by Claude Code. `GoogleMark` only loads the file the owner adds (P2 spec §5.5).
- New dependencies: `@supabase/supabase-js@^2`; dev `supabase` and `tsx`. Nothing else. Deno code imports `npm:@supabase/supabase-js@2`.
- Test data:
  - Seed and mock emails use `@example.com`; pgTAP emails use `@test.dev`.
  - The local seed password is `localdemo2026` (local stack only).
  - Tests that create accounts on the stack use unique emails.

## Review Focus

1. **Opening an invite link in a browser where someone else is signed in.** Expected: the session switches and nothing from the previous user's cache shows. Pinned in Task 4 (`AuthProvider` user-switch test).
2. **Mail scanners and link previews opening email links first.** Expected: loading `/accept-invite` or `/reset-password` never uses the token; only submitting does, and a retry after a later failure doesn't verify twice. Pinned in Task 5.
3. **The session expiring while several queries are mounted.** Expected: one sign-out and one "Your session expired. Please sign in again." toast; a wrong password while signed out never triggers it. Pinned in Task 4.
4. **Invite emails typed with capitals or spaces** (`  Elif.Arslan@Example.COM `). Expected: the same address everywhere — "already a member" is detected and no second pending invitation appears. Pinned in Task 3 (contract) and Task 13 (function logic).
5. **Browser storage blocked while using Supabase.** Expected: sign-in still works for the page's lifetime and nothing throws. Pinned in Task 14 (client storage adapter).

## Files beyond the P2 spec's tree (§4.3)

| File | Responsibility | Task |
|---|---|---|
| `docs/superpowers/plans/2026-10-15-phase2-verification.md` | V1–V6 results and the owner checklist | 1, 19 |
| `.env.supabase` | defaults for Vite mode `supabase` | 1 |
| `src/auth/auth-options.ts` | demo mode and Google-button visibility from env | 4 |
| `src/hooks/useAuthActions.ts` | auth mutation hooks and `useOAuthCallback` | 4, 5 |
| `src/auth/safe-next.ts`, `src/features/auth/AuthCard.tsx`, `src/features/auth/password-schema.ts` | open-redirect guard, shared card, password rules | 5 |
| `src/hooks/useMembers.ts`, `src/hooks/useProfile.ts` | member, invitation and profile hooks | 6, 8 |
| `supabase/tests/_helpers.psql` | pgTAP helpers | 9 |

## Tasks

| # | Task | Deliverable |
|---|---|---|
| 1 | Local stack, auth settings and assumption checks | stack running; V1(a–c), V2–V5 recorded |
| 2 | Contract suite and shared ordering | Phase 1 behaviors pinned for every adapter |
| 3 | Roles, members and invitations in the mock | contract extended; mock passes |
| 4 | `AuthService` v2 and the sign-in page | auth contract on the mock; provider rules tested |
| 5 | Email-link pages and the Google callback | four pages + routes tested |
| 6 | Members dialog | dialog + panel button tested; mock e2e |
| 7 | Viewer restrictions | banner, cards, switcher tested |
| 8 | Missing names and cover photos | dialog, greeting, image preparation tested |
| 9 | Core schema, grants and helpers | pgTAP schema + privileges |
| 10 | Account bootstrap | pgTAP + admin-API check |
| 11 | RLS, views and RPCs | pgTAP isolation and RPC tests |
| 12 | Storage buckets and policies | pgTAP storage tests |
| 13 | Invitations Edge Function | logic tests + local function check |
| 14 | Supabase adapter foundations | client, mappers, errors, signed URLs tested |
| 15 | `SupabaseRepository` and the local seed | repository contract on Supabase |
| 16 | `SupabaseAuthService` and the data-layer switch | auth contract on Supabase |
| 17 | End-to-end tests on the local stack | Playwright `supabase` green |
| 18 | Production hardening and CI | headers, secrets check, CI, runbook |
| 19 | Final verification and docs | everything green; owner checklist |

---

### Task 1: Local stack, auth settings and assumption checks

**Spec:** §4.1–§4.4, §5.1, §5.2, §11 (V1(a–c), V2 key names, V3, V4, V5).

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/seed.sql` (empty), `supabase/templates/invite.html`, `supabase/templates/recovery.html`, `integration/local-stack.ts`, `integration/mailbox.ts`, `scripts/write-local-env.ts`, `vitest.integration.config.ts`, `tsconfig.integration.json`, `.env.supabase`, `docs/superpowers/plans/2026-10-15-phase2-verification.md`
- Modify: `package.json`, `tsconfig.json` (references), `vitest.config.ts`, `.gitignore`, `CLAUDE.md`
- Test: `integration/local-stack.test.ts` (unit), `integration/assumptions.itest.ts` (local stack)

**Interfaces:**
- Produces (`integration/local-stack.ts`):
  ```ts
  export interface LocalStack { apiUrl: string; publishableKey: string; secretKey: string; dbUrl: string; mailUrl: string }
  export function parseStatus(json: string): LocalStack;
  export function readLocalStack(): LocalStack;              // execFileSync('npx', ['supabase', 'status', '-o', 'json'])
  export function formatLocalEnv(stack: LocalStack): string; // content of .env.supabase.local
  ```
  `parseStatus` reads `API_URL`, `PUBLISHABLE_KEY` (fallback `ANON_KEY`), `SECRET_KEY` (fallback `SERVICE_ROLE_KEY`), `DB_URL` and `MAILPIT_URL` (fallback `INBUCKET_URL`, then `http://127.0.0.1:54324`). A missing required key throws `Error('supabase status is missing <KEY>')`. `formatLocalEnv` returns `VITE_SUPABASE_URL=<apiUrl>\nVITE_SUPABASE_PUBLISHABLE_KEY=<publishableKey>\n`.
- Produces (`integration/mailbox.ts`, no Node-only APIs, no `@/` imports):
  - `waitForEmail(mailUrl: string, to: string, options?: { subject?: string; after?: Date; timeoutMs?: number }): Promise<{ subject: string; html: string }>` — polls every 250 ms, timeout 10 000 ms by default, and returns the newest matching message. It detects the API once: `GET {mailUrl}/api/v1/info` answering 200 means Mailpit (`/api/v1/search?query=to:"<email>"`, then `/api/v1/message/<ID>`); otherwise Inbucket (`/api/v1/mailbox/<local-part>`, then `/api/v1/mailbox/<local-part>/<id>`).
  - `tokenHashFrom(html: string): string` — the first `token_hash=` value (stops at `&`, `"` or whitespace); throws `Error('No token_hash in email')`.
- Produces npm scripts:
  - `db:start` = `supabase start`, `db:stop` = `supabase stop`.
  - `db:reset` = `supabase db reset` (Task 15 adds seeding).
  - `db:env` = `tsx scripts/write-local-env.ts`.
  - `test:integration` = `vitest run -c vitest.integration.config.ts`.
- Produces `vitest.integration.config.ts`: `mergeConfig(viteConfig, defineConfig({ test: { environment: 'node', include: ['integration/**/*.itest.ts'], testTimeout: 30_000, hookTimeout: 60_000 } }))`, with `viteConfig` imported from `./vite.config.ts`.

- [ ] **Step 1: Install and initialize**

```bash
npm install @supabase/supabase-js@^2
npm install -D supabase tsx
npx supabase init
```
Expected: `supabase/config.toml` exists. Decline any editor-settings prompt; per the CLI fallback rule, use the non-interactive equivalent if one exists.

- [ ] **Step 2: Configure `supabase/config.toml`** — change only these keys and keep everything else the CLI wrote:

| Section | Key = value |
|---|---|
| `[api]` | `auto_expose_new_tables = false` (new objects in `public` get no API-role privileges unless a migration grants them; the migrations revoke and grant explicitly anyway) |
| `[auth]` | `site_url = "http://localhost:5173"`; `additional_redirect_urls = ["http://localhost:5173/**", "http://localhost:4174/**"]`; `enable_signup = false`; `minimum_password_length = 10`; `password_requirements = "letters_digits"` |
| `[auth.email]` | `otp_expiry = 86400`; `max_frequency = "1s"` (local only, so tests can re-invite at once) |
| `[auth.rate_limit]` | every value present raised to `1000` (local only; contract tests sign in and send mail many times) |
| `[auth.email.template.invite]` | `subject = "You're invited to AppName"`; `content_path = "./supabase/templates/invite.html"` |
| `[auth.email.template.recovery]` | `subject = "Reset your AppName password"`; `content_path = "./supabase/templates/recovery.html"` |
| `[auth.external.google]` | `enabled = false`; `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`; `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"` (enable locally only when a Google client exists) |

(Checked against Supabase CLI 2.121: all of these keys exist. The local mail catcher is configured in `[local_smtp]` (Mailpit, port 54324), and `supabase status -o json` reports both `MAILPIT_URL` and `INBUCKET_URL`, plus `PUBLISHABLE_KEY` / `SECRET_KEY` next to the legacy `ANON_KEY` / `SERVICE_ROLE_KEY`.)

- [ ] **Step 3: Write the email templates** — `supabase/templates/invite.html`; `recovery.html` uses the same frame:

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;">You're invited to AppName</h1>
          <p style="margin:0 0 24px;font-size:14px;line-height:22px;">{{ if .Data.workspace_name }}{{ .Data.inviter_name }} invited you to the {{ .Data.workspace_name }} workspace.{{ else }}You've been invited to join AppName.{{ end }} Accept the invitation to set up your account. The link works for 24 hours.</p>
          <a href="{{ .SiteURL }}/accept-invite?token_hash={{ .TokenHash }}&amp;type=invite" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">Accept invitation</a>
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>
```

For `recovery.html`, use the same frame with:
- heading "Reset your AppName password";
- paragraph "Use the button below to choose a new password. The link works for 24 hours. If you didn't ask for this, you can ignore this email.";
- button "Choose a new password" linking to `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&amp;type=recovery`.

(Emails can't read CSS variables, so `#4f46e5` is `--brand-600` written out. If the brand changes, edit it here too.)

- [ ] **Step 4: Wire TypeScript, Vitest and git**
  - Create `tsconfig.integration.json` and add it to the root `tsconfig.json` `references`, so `npm run typecheck` (`tsc -b`) covers it. It gets its own project because these files use Node APIs and also pull in `src/` modules that need DOM types.
    - Settings: those of `tsconfig.app.json`, but with `lib ["ES2023", "DOM", "DOM.Iterable"]`, `types ["node", "vite/client"]`, `allowImportingTsExtensions` and its own `tsBuildInfoFile` (`./node_modules/.tmp/tsconfig.integration.tsbuildinfo`).
    - `include`: `["integration", "scripts/**/*.ts", "e2e-supabase", "playwright.supabase.config.ts", "vitest.integration.config.ts", "supabase/functions/**/logic*.ts", "src/vite-env.d.ts"]`. Patterns that match nothing yet are fine; later tasks add those files.
  - `vitest.config.ts` `include` gains `'integration/**/*.test.ts'`.
  - `.gitignore` gains `*.local` (if absent), `supabase/.temp` and `supabase/.branches`.
  - Create `.env.supabase` with one line: `VITE_DATA_SOURCE=supabase`.
  - Create `supabase/seed.sql` holding a comment only: `-- Intentionally empty: scripts/seed-local.ts creates auth users and data.`

- [ ] **Step 5: Write the failing unit test** — `integration/local-stack.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { formatLocalEnv, parseStatus } from './local-stack';

describe('parseStatus', () => {
  it('reads the new key names', () => {
    const stack = parseStatus(JSON.stringify({ API_URL: 'http://127.0.0.1:54321', PUBLISHABLE_KEY: 'sb_publishable_a', SECRET_KEY: 'sb_secret_b', DB_URL: 'postgresql://db', MAILPIT_URL: 'http://127.0.0.1:54324' }));
    expect(stack).toEqual({ apiUrl: 'http://127.0.0.1:54321', publishableKey: 'sb_publishable_a', secretKey: 'sb_secret_b', dbUrl: 'postgresql://db', mailUrl: 'http://127.0.0.1:54324' });
  });

  it('falls back to the legacy names', () => {
    const stack = parseStatus(JSON.stringify({ API_URL: 'http://127.0.0.1:54321', ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'service', DB_URL: 'postgresql://db', INBUCKET_URL: 'http://127.0.0.1:54324' }));
    expect([stack.publishableKey, stack.secretKey, stack.mailUrl]).toEqual(['anon', 'service', 'http://127.0.0.1:54324']);
  });

  it('names the missing key', () => {
    expect(() => parseStatus(JSON.stringify({ API_URL: 'x', DB_URL: 'y' }))).toThrow('supabase status is missing PUBLISHABLE_KEY');
  });

  it('formats the local env file', () => {
    const stack = { apiUrl: 'http://127.0.0.1:54321', publishableKey: 'pk', secretKey: 'sk', dbUrl: 'db', mailUrl: 'mail' };
    expect(formatLocalEnv(stack)).toBe('VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=pk\n');
  });
});
```

- [ ] **Step 6: Run it to see it fail** — `npx vitest run integration` → FAIL (module not found).

- [ ] **Step 7: Implement** `integration/local-stack.ts` and `integration/mailbox.ts` per Interfaces, and `scripts/write-local-env.ts`, which writes `formatLocalEnv(readLocalStack())` to `.env.supabase.local` and prints `Wrote .env.supabase.local`. Run `npx vitest run integration` → PASS.

- [ ] **Step 8: Write the assumption checks** — `integration/assumptions.itest.ts`

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack, type LocalStack } from './local-stack';
import { tokenHashFrom, waitForEmail } from './mailbox';

let stack: LocalStack;
let admin: SupabaseClient;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const unique = () => `check.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;
const anon = () => createClient(stack.apiUrl, stack.publishableKey, options);

async function invite(email: string, data?: Record<string, string>) {
  const after = new Date();
  const { data: created, error } = await admin.auth.admin.inviteUserByEmail(email, data ? { data } : undefined);
  expect(error).toBeNull();
  return { userId: created.user!.id, mail: await waitForEmail(stack.mailUrl, email, { after, subject: "You're invited to AppName" }) };
}

beforeAll(() => {
  stack = readLocalStack();
  admin = createClient(stack.apiUrl, stack.secretKey, options);
});

describe('local stack assumptions (P2 spec §11)', () => {
  it('V2: status exposes the URL and two different keys', () => {
    expect(stack.apiUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
    expect(stack.publishableKey).not.toBe('');
    expect(stack.secretKey).not.toBe(stack.publishableKey);
  });

  it('public sign-up is disabled', async () => {
    const { error } = await anon().auth.signUp({ email: unique(), password: 'letters12345' });
    expect(error).not.toBeNull();
  });

  it('V1(a), V3, V5: an admin invite works and uses our template with metadata', async () => {
    const { mail } = await invite(unique(), { inviter_name: 'Deniz Kaya', workspace_name: 'Site Operations' });
    expect(mail.html).toContain('Deniz Kaya invited you to the Site Operations workspace.');
    expect(mail.html).toContain('/accept-invite?token_hash=');
    expect(tokenHashFrom(mail.html)).toMatch(/^[\w-]{20,}$/);
  });

  it('V5: an invite without metadata uses the generic sentence', async () => {
    const { mail } = await invite(unique());
    expect(mail.html).toContain("You've been invited to join AppName.");
  });

  it('V1(b): re-inviting an unconfirmed account sends a fresh link with the new metadata', async () => {
    const email = unique();
    const first = await invite(email, { inviter_name: 'Deniz Kaya', workspace_name: 'Alpha' });
    await admin.auth.admin.updateUserById(first.userId, { user_metadata: { inviter_name: 'Mert Demir', workspace_name: 'Beta' } });
    const second = await invite(email, { inviter_name: 'Mert Demir', workspace_name: 'Beta' });
    expect(second.mail.html).toContain('Mert Demir invited you to the Beta workspace.');
    expect(tokenHashFrom(second.mail.html)).not.toBe(tokenHashFrom(first.mail.html));
  });

  it('V1(c), V4: verifying an invite confirms the account; the password policy applies', async () => {
    const email = unique();
    const { userId, mail } = await invite(email);
    const client = anon();
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHashFrom(mail.html), type: 'invite' });
    expect(error).toBeNull();
    const { data } = await admin.auth.admin.getUserById(userId);
    expect(data.user?.email_confirmed_at).toBeTruthy();
    for (const weak of ['short12', 'onlyletterspassword']) {
      const result = await client.auth.updateUser({ password: weak });
      expect(result.error?.code).toBe('weak_password');
    }
    expect((await client.auth.updateUser({ password: 'letters12345' })).error).toBeNull();
  });

  it('V1(c), V1(e): a reset requested by the app\'s PKCE client verifies in another browser and confirms a pending account', async () => {
    const email = unique();
    const { userId } = await invite(email);
    const pkceClient = () => {
      const memory = new Map<string, string>();
      const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); }, removeItem: (k: string) => { memory.delete(k); } };
      return createClient(stack.apiUrl, stack.publishableKey, { auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
    };
    const after = new Date();
    await pkceClient().auth.resetPasswordForEmail(email);
    const mail = await waitForEmail(stack.mailUrl, email, { after, subject: 'Reset your AppName password' });
    const otherBrowser = pkceClient(); // fresh storage: no code verifier from the request
    expect((await otherBrowser.auth.verifyOtp({ token_hash: tokenHashFrom(mail.html), type: 'recovery' })).error).toBeNull();
    expect((await otherBrowser.auth.getSession()).data.session).not.toBeNull();
    const { data } = await admin.auth.admin.getUserById(userId);
    expect(data.user?.email_confirmed_at).toBeTruthy();
  });
});
```

- [ ] **Step 9: Start the stack and run the checks**

```bash
npm run db:start
npm run db:env
npm run test:integration
```
Expected:
- `db:start` prints the local URLs and keys. The first run downloads Docker images, which takes minutes.
- `.env.supabase.local` is written.
- Every assumption test passes.

If a check fails:
1. Record it in the verification notes with the CLI version.
2. Apply the fallback from P2 spec §11.
3. **Stop and tell the owner before Task 2.** Later tasks assume the primary path.

- [ ] **Step 10: Write the verification notes** — `docs/superpowers/plans/2026-10-15-phase2-verification.md`, with these sections:
  - "Environment": `npx supabase --version`, `node -v`, mail catcher (Mailpit or Inbucket), the status key names seen.
  - "V1–V6": result and date per item. V1(d) and V6 say "pending — first deployment".
  - "Owner checklist": filled in Task 19.

- [ ] **Step 11: Update `CLAUDE.md`**
  - Status: `Phase 2 in progress — follow the Phase 2 plan task by task. (Phase 1 is complete.)`
  - Sources of truth: the P2 spec and this plan first; the Phase 1 spec and plan for everything P2 leaves unchanged.
  - Commands: add the scripts from P2 spec §4.4, noting "(added in Task N)" for those not created yet.
  - Rules:
    - "Never put the Supabase secret key in a `VITE_*` variable, a committed file or a test fixture."
    - "SQL: follow the Phase 2 plan's Global Constraints."
    - IP rule exception: "The Google mark is loaded only from the owner's file (`src/assets/third-party/google-g.svg`); never draw or embed it."

- [ ] **Step 12: Run** `npm run check` → all checks pass.

- [ ] **Step 13: Commit**

```bash
git add -A && git commit -m "chore: add the local Supabase stack, auth settings and assumption checks"
```

---

### Task 2: Contract suite and shared ordering

**Spec:** §6.2 (ordering rules), §9 (repository contract); Phase 1 spec §5.2.

**Files:**
- Create: `src/data/sort.ts`, `src/test/contract/repository.contract.ts`, `src/test/contract/mock.contract.test.ts`
- Modify: `src/data/mock/MockRepository.ts` (use the comparators)
- Test: `src/data/sort.test.ts`

**Interfaces:**
- Produces (`src/data/sort.ts`):
  ```ts
  export function compareText(a: string, b: string): number;             // toLowerCase(), then code-point order
  export function compareWorkspaces(a: Workspace, b: Workspace): number; // personal first, then name, createdAt, id
  export function newestFirst<T extends { id: ID }>(timestamp: (item: T) => string): (a: T, b: T) => number; // desc, ties by id asc
  ```
- Produces (`src/test/contract/repository.contract.ts`):
  ```ts
  export type ContractScenario = 'default' | 'empty';
  export interface ContractUser { id: ID; email: string; firstName: string; lastName: string }
  export interface FixtureOptions { scenario?: ContractScenario }          // Task 3 adds teamRole
  export interface RepositoryFixture {
    repository: DataRepository;
    users: { current: ContractUser; mert: ContractUser | null; elif: ContractUser | null };
    workspaces: { personal: ID; team: ID | null };
    projectIds: Record<string, ID>;   // by code: '001'…'006', 'T-01'
    trialEndsAt: ISODateTime;
  }
  export type MakeRepositoryFixture = (options?: FixtureOptions) => Promise<RepositoryFixture>;
  export function runRepositoryContract(label: string, makeFixture: MakeRepositoryFixture): void;
  ```
- The mock runner (`mock.contract.test.ts`) builds the fixture from `createTestDataLayer({ scenario })`:
  - users are looked up by seed email;
  - `projectIds` maps each project code to its id;
  - `trialEndsAt` is the store's subscription value.
- Pins for `MockRepository`:
  - `listWorkspaces` sorts with `compareWorkspaces`.
  - `listProjects` and `listSharedWithMe` use `newestFirst`.
  - `listPendingTasks` keeps Phase 1's order (due date ascending, undated last, then `createdAt`) and adds `id` as the final tie-break.

- [ ] **Step 1: Write the failing test** — `src/data/sort.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { compareText, compareWorkspaces, newestFirst } from '@/data/sort';

describe('sort', () => {
  it('compares text case-insensitively in code-point order', () => {
    expect(['Zeta', 'şantiye', 'alpha', 'Beta'].sort(compareText)).toEqual(['alpha', 'Beta', 'Zeta', 'şantiye']);
    expect(compareText('Crew', 'crew')).toBe(0);
  });

  it('puts the personal workspace first, then teams by name, age and id', () => {
    const w = (id: string, name: string, kind: 'personal' | 'team', createdAt = '2026-01-01T00:00:00.000Z') => ({ id, name, kind, createdAt });
    const list = [w('4', 'crew', 'team', '2026-02-01T00:00:00.000Z'), w('3', 'Crew', 'team'), w('2', 'Alpha', 'team'), w('1', 'My workspace', 'personal')];
    expect(list.sort(compareWorkspaces).map((x) => x.id)).toEqual(['1', '2', '3', '4']);
  });

  it('orders newest first and breaks ties by id', () => {
    const rows = [{ id: 'b', at: '2026-01-01T00:00:00.000Z' }, { id: 'a', at: '2026-01-01T00:00:00.000Z' }, { id: 'c', at: '2026-02-01T00:00:00.000Z' }];
    expect(rows.sort(newestFirst((r) => r.at)).map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run src/data/sort.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/data/sort.ts`** per Interfaces. Run it → PASS.

- [ ] **Step 4: Write the contract suite** — `src/test/contract/repository.contract.ts`, with the types from Interfaces and this body:

```ts
const unknownIds = () => [crypto.randomUUID(), 'not-a-uuid'];

export function runRepositoryContract(label: string, makeFixture: MakeRepositoryFixture): void {
  describe(`DataRepository contract — ${label}`, () => {
    it('returns the current user and the trial', async () => {
      const f = await makeFixture();
      expect(await f.repository.getCurrentUser()).toMatchObject({ id: f.users.current.id, firstName: 'Deniz', lastName: 'Kaya', email: f.users.current.email });
      expect(await f.repository.getSubscription()).toEqual({ plan: 'trial', trialEndsAt: f.trialEndsAt });
    });

    it('lists workspaces personal first, then teams by name, with project counts', async () => {
      const f = await makeFixture();
      await f.repository.createTeamWorkspace({ name: '  alpha crew ' });
      expect((await f.repository.listWorkspaces()).map((w) => [w.name, w.kind, w.projectCount])).toEqual([
        ['My workspace', 'personal', 6], ['alpha crew', 'team', 0], ['Site Operations', 'team', 1],
      ]);
    });

    it('lists projects newest first with schedule counts and limits recent ones', async () => {
      const f = await makeFixture();
      expect((await f.repository.listProjects(f.workspaces.personal)).map((p) => [p.code, p.scheduleCount])).toEqual([
        ['001', 1], ['002', 0], ['003', 3], ['004', 2], ['005', 1], ['006', 0],
      ]);
      expect((await f.repository.listRecentProjects(f.workspaces.personal, 5)).map((p) => p.code)).toEqual(['001', '002', '003', '004', '005']);
      for (const id of unknownIds()) expect(await f.repository.listProjects(id)).toEqual([]);
    });

    it('checks project IDs trimmed, case-insensitively and literally', async () => {
      const f = await makeFixture();
      const ws = f.workspaces.personal;
      expect(await f.repository.isProjectCodeAvailable(ws, ' 001 ')).toBe(false);
      expect(await f.repository.isProjectCodeAvailable(ws, 'ABC')).toBe(true);
      await f.repository.createProject(makeNewProjectInput(ws, { code: 'abc', name: 'Pier 9' }));
      expect(await f.repository.isProjectCodeAvailable(ws, 'ABC')).toBe(false);
      await expect(f.repository.createProject(makeNewProjectInput(ws, { code: 'ABC', name: 'Duplicate' })))
        .rejects.toMatchObject({ code: 'conflict', message: 'This ID is already used in this workspace' });
      await f.repository.createProject(makeNewProjectInput(ws, { code: 'A_1', name: 'Underscore' }));
      expect(await f.repository.isProjectCodeAvailable(ws, 'AB1')).toBe(true);
    });

    it('trims input, stores empty optionals as null and keeps the cover image', async () => {
      const f = await makeFixture();
      const created = await f.repository.createProject(makeNewProjectInput(f.workspaces.personal, {
        code: '007', name: '  Pier 9  ', description: '', coverImage: new File(['png'], 'cover.png', { type: 'image/png' }),
      }));
      expect(created).toMatchObject({ name: 'Pier 9', description: null });
      expect(created.coverImageUrl).toEqual(expect.any(String));
    });

    it('moves a project to the top of recent projects when a schedule is added', async () => {
      const f = await makeFixture();
      const before = (await f.repository.listProjects(f.workspaces.personal)).find((p) => p.code === '006')!;
      const schedule = await f.repository.createSchedule({ projectId: f.projectIds['006']!, name: 'Baseline' });
      expect(schedule).toMatchObject({ source: 'blank', sourceFileName: null, statusDate: before.statusDate });
      expect((await f.repository.listRecentProjects(f.workspaces.personal, 5))[0]).toMatchObject({ code: '006', scheduleCount: 1 });
    });

    it('records imported schedules and rejects unknown projects', async () => {
      const f = await makeFixture();
      const imported = await f.repository.importSchedule({ projectId: f.projectIds['002']!, name: 'Rev 7', file: new File(['x'], 'rev7.XER') });
      expect(imported).toMatchObject({ source: 'import', sourceFileName: 'rev7.XER' });
      for (const id of unknownIds()) {
        await expect(f.repository.createSchedule({ projectId: id, name: 'X' })).rejects.toMatchObject({ code: 'not_found', message: 'Project not found' });
      }
    });

    it('lists schedules shared with me newest first', async () => {
      const f = await makeFixture();
      expect((await f.repository.listSharedWithMe()).map((r) => [r.scheduleName, r.sharedBy.firstName, r.projectName])).toEqual([
        ['Baseline rev. 3', 'Mert', 'Tunnel Ventilation Upgrade'],
        ['Look-ahead W42', 'Elif', 'Tunnel Ventilation Upgrade'],
      ]);
    });

    it('orders pending tasks by due date, undated last, and toggles them', async () => {
      const f = await makeFixture();
      const tasks = await f.repository.listPendingTasks();
      expect(tasks.map((t) => t.title)).toEqual([
        'Update status date for Riverside Office Tower', 'Import revised baseline from contractor', 'Review look-ahead schedule',
      ]);
      await f.repository.setTaskDone(tasks[0]!.id, true);
      expect(await f.repository.listPendingTasks()).toHaveLength(2);
      await f.repository.setTaskDone(tasks[0]!.id, false);
      expect(await f.repository.listPendingTasks()).toHaveLength(3);
      for (const id of unknownIds()) {
        await expect(f.repository.setTaskDone(id, true)).rejects.toMatchObject({ code: 'not_found', message: 'Task not found' });
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
```
(`makeNewProjectInput` comes from `@/test/fakes`; `describe`, `expect` and `it` from `vitest`.)

- [ ] **Step 5: Add the mock runner** — `src/test/contract/mock.contract.test.ts` calls `runRepositoryContract('mock', makeMockFixture)`, where `makeMockFixture` builds the fixture as described in Interfaces.

- [ ] **Step 6: Run** `npx vitest run src/test/contract` → green once `MockRepository` uses the comparators and accepts any id string. Fix the mock where a test fails; never weaken the suite.

- [ ] **Step 7: Run** `npm run check` → all checks pass.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "test: add the repository contract suite and shared ordering"
```

---

### Task 3: Roles, members and invitations in the mock

**Spec:** §6.1, §6.2, §6.4, §5.7 (rules and messages); Phase 1 spec §5.4 (`errorMessage`).

**Files:**
- Modify:
  - `src/data/types.ts` (§6.1 additions verbatim), `src/data/errors.ts` (codes), `src/data/repository.ts` (§6.2 additions verbatim)
  - `src/lib/format.ts` (`errorMessage`), `src/data/sort.ts` (`compareMembers`)
  - `src/data/mock/seed.ts`, `src/data/mock/store.ts`, `src/data/mock/MockRepository.ts`
  - `src/data/index.ts` (`VITE_MOCK_TEAM_ROLE`), `src/vite-env.d.ts`, `.env.example`, `src/test/fakes.ts`
  - `src/test/contract/repository.contract.ts`, `src/test/contract/mock.contract.test.ts`
  - any test that builds a `WorkspaceSummary` by hand (add `myRole`)
- Test: `src/lib/format.test.ts`, `src/data/sort.test.ts`, `src/data/mock/seed.test.ts`, `src/data/mock/store.test.ts` (the `version: 1` expectations become `2`), the contract suite

**Interfaces:**
- Consumes: `compareText`, `newestFirst` (Task 2).
- Produces:
  ```ts
  // src/data/errors.ts
  export type RepositoryErrorCode =
    | 'not_found' | 'conflict' | 'validation' | 'unauthorized' | 'forbidden' | 'rate_limited' | 'network' | 'unknown';
  // src/data/sort.ts
  export function compareMembers(a: WorkspaceMember, b: WorkspaceMember): number; // owner > editor > viewer, then full name (email when empty), then email
  // src/data/mock/seed.ts
  export interface MockMember { workspaceId: ID; userId: ID; role: Role; joinedAt: ISODateTime }
  export interface MockInvitation {
    id: ID; workspaceId: ID; email: string; role: Role; invitedById: ID | null;
    invitedAt: ISODateTime; acceptedAt: ISODateTime | null; revokedAt: ISODateTime | null;
  }
  // MockDb: version 2; adds teamRole: Role, members: MockMember[], invitations: MockInvitation[]
  export function seed(scenario: Scenario, now: Date, options?: { teamRole?: Role }): MockDb;
  // src/data/mock/store.ts
  export function createMockStore(options: { storage: StorageLike | null; scenario: Scenario; teamRole?: Role; now?: () => Date }): MockStore;
  // src/test/fakes.ts
  export function createTestDataLayer(options?: { scenario?: Scenario; teamRole?: Role; failRate?: number; now?: Date; overrides?: Partial<DataRepository> }): TestDataLayer;
  // src/test/contract/repository.contract.ts (extended)
  export interface FixtureOptions { scenario?: ContractScenario; teamRole?: Role }
  // RepositoryFixture gains: pendingInvitationEmail: string | null
  ```
- `errorMessage(error)`: P2 spec §6.1 table.
- `createDataLayer`: `VITE_MOCK_TEAM_ROLE` is `owner` | `editor` | `viewer`; anything else means `owner`. `DataLayerEnv` gains the field.
- Store: reseeds when the stored `teamRole` differs from `options.teamRole ?? 'owner'`, like a scenario change.
- Seed: P2 spec §6.4, with exact-millisecond offsets from `now`.
  - Default scenario — My workspace: Deniz owner, joined at the workspace's `createdAt`.
  - Default scenario — Site Operations: Deniz with `teamRole` (−30 days), Mert owner (−20), Elif viewer (−10).
  - Invitation: `site.planner@example.com` as `editor`, invited by Deniz at −2 days.
  - Empty scenario: only Deniz's owner membership; no invitations.
- Rules in `MockRepository` (the database enforces the same in Tasks 11 and 13):

| Method | Rule, in this order | Rejection / result |
|---|---|---|
| `inviteMember` | email trimmed and lowercased; it matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` and the role is known | `validation` "Check the email and role." |
| | caller is an owner of the workspace (an unknown workspace fails here) | `forbidden` "Only workspace owners can invite people." |
| | the workspace is a team workspace | `validation` "Invite people to a team workspace." |
| | a user with that email is already a member | `conflict` "{email} is already a member." |
| | a user with that email exists | add the membership (`joinedAt` now) and an accepted invitation → `{ status: 'added' }` |
| | otherwise | create the pending invitation, or update the pending one (role, `invitedAt`, `invitedById`) → `{ status: 'invited' }` |
| `revokeInvitation` | pending, and the caller owns its workspace | else `forbidden` "Only workspace owners can revoke invitations."; sets `revokedAt` |
| `updateMemberRole`, `removeMember` | caller is an owner | `forbidden` "Only workspace owners can change members." |
| | the target is a member | `validation` "This person is no longer a member." |
| | an owner remains afterwards | `validation` "A workspace needs at least one owner." |
| `createProject`, `createSchedule`, `importSchedule` | an unknown project is still `not_found` first; then the caller must be editor+ in the workspace | `forbidden` "You don't have permission to do that." |
| `listMembers` | caller is a member, else `[]` | sorted with `compareMembers` |
| `listInvitations` | caller is an owner, else `[]` | pending only, `newestFirst(invitedAt)` |
| `listWorkspaces` | workspaces where the caller is a member | `myRole` from the membership |
| `createTeamWorkspace` | trims the name, as in Phase 1; also inserts the caller's `owner` membership (`joinedAt` now), or the new workspace would never be listed | the new `Workspace` |
| `updateProfile` | trims both names | the updated `User` |

- [ ] **Step 1: Write the failing tests**

`src/lib/format.test.ts` — replace the error-message case:

```ts
it('maps error codes to copy', () => {
  expect(errorMessage(new RepositoryError('validation', 'A workspace needs at least one owner.'))).toBe('A workspace needs at least one owner.');
  expect(errorMessage(new RepositoryError('conflict', 'x@example.com is already a member.'))).toBe('x@example.com is already a member.');
  expect(errorMessage(new RepositoryError('forbidden', 'raw'))).toBe("You don't have permission to do that.");
  expect(errorMessage(new RepositoryError('unauthorized', 'raw'))).toBe('Your session expired. Please sign in again.');
  expect(errorMessage(new RepositoryError('rate_limited', 'raw'))).toBe('Too many attempts. Wait a minute and try again.');
  expect(errorMessage(new RepositoryError('network', 'raw'))).toBe("Can't reach the server. Check your connection and try again.");
  expect(errorMessage(new RepositoryError('not_found', 'raw'))).toBe('Something went wrong. Please try again.');
  expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
});
```

`src/data/sort.test.ts` — add:

```ts
it('orders members by role, then name (email when empty), then email', () => {
  const m = (role: Role, firstName: string, email: string): WorkspaceMember => ({ userId: email, firstName, lastName: '', email, role, joinedAt: '2026-01-01T00:00:00.000Z' });
  const list = [m('viewer', 'Ann', 'a@x.dev'), m('owner', 'zed', 'z@x.dev'), m('editor', 'Bob', 'b@x.dev'), m('owner', 'Amy', 'y@x.dev'), m('owner', '', 'c@x.dev')];
  expect(list.sort(compareMembers).map((x) => x.email)).toEqual(['y@x.dev', 'c@x.dev', 'z@x.dev', 'b@x.dev', 'a@x.dev']);
});
```

`src/data/mock/seed.test.ts` — add:

```ts
it('seeds members, roles and a pending invitation', () => {
  const db = seed('default', now);
  const team = db.workspaces.find((w) => w.kind === 'team')!;
  const roleOf = (d: MockDb, email: string) => {
    const teamId = d.workspaces.find((w) => w.kind === 'team')!.id;
    return d.members.find((m) => m.workspaceId === teamId && m.userId === d.users.find((u) => u.email === email)!.id)?.role;
  };
  expect(['deniz.kaya@example.com', 'mert.demir@example.com', 'elif.arslan@example.com'].map((e) => roleOf(db, e))).toEqual(['owner', 'owner', 'viewer']);
  expect(db.invitations).toEqual([expect.objectContaining({ workspaceId: team.id, email: 'site.planner@example.com', role: 'editor', invitedAt: '2026-10-12T10:00:00.000Z', acceptedAt: null, revokedAt: null })]);
  expect(roleOf(seed('default', now, { teamRole: 'viewer' }), 'deniz.kaya@example.com')).toBe('viewer');
  expect(seed('empty', now)).toMatchObject({ invitations: [], members: [expect.objectContaining({ role: 'owner' })] });
});
```

`src/data/mock/store.test.ts` — add:

```ts
it('writes version 2 and reseeds when the team role changes', () => {
  const storage = createMemoryStorage();
  expect(createMockStore({ storage, scenario: 'default' }).read()).toMatchObject({ version: 2, teamRole: 'owner' });
  expect(createMockStore({ storage, scenario: 'default', teamRole: 'viewer' }).read().teamRole).toBe('viewer');
});
```

`src/test/contract/repository.contract.ts` — inside `runRepositoryContract`, add:

```ts
describe('members and invitations', () => {
  it('reports my role per workspace', async () => {
    const f = await makeFixture({ teamRole: 'viewer' });
    expect((await f.repository.listWorkspaces()).map((w) => [w.name, w.myRole])).toEqual([['My workspace', 'owner'], ['Site Operations', 'viewer']]);
  });

  it('lists members owners first, then by name', async () => {
    const f = await makeFixture();
    expect((await f.repository.listMembers(f.workspaces.team!)).map((m) => [`${m.firstName} ${m.lastName}`, m.role])).toEqual([
      ['Deniz Kaya', 'owner'], ['Mert Demir', 'owner'], ['Elif Arslan', 'viewer'],
    ]);
  });

  it('shows pending invitations to owners only', async () => {
    const owner = await makeFixture();
    expect((await owner.repository.listInvitations(owner.workspaces.team!)).map((i) => [i.email, i.role])).toEqual([[owner.pendingInvitationEmail, 'editor']]);
    const viewer = await makeFixture({ teamRole: 'viewer' });
    expect(await viewer.repository.listInvitations(viewer.workspaces.team!)).toEqual([]);
  });

  it('invites a new email once, however it is typed', async () => {
    const f = await makeFixture();
    const email = `new.person.${crypto.randomUUID().slice(0, 8)}@example.com`;
    await expect(f.repository.inviteMember({ workspaceId: f.workspaces.team!, email: `  ${email.toUpperCase()} `, role: 'editor' })).resolves.toEqual({ status: 'invited' });
    await expect(f.repository.inviteMember({ workspaceId: f.workspaces.team!, email, role: 'viewer' })).resolves.toEqual({ status: 'invited' });
    expect((await f.repository.listInvitations(f.workspaces.team!)).filter((i) => i.email === email).map((i) => i.role)).toEqual(['viewer']);
  });

  it('adds an existing account directly and refuses current members', async () => {
    const f = await makeFixture();
    const crew = await f.repository.createTeamWorkspace({ name: 'Field crew' });
    await expect(f.repository.inviteMember({ workspaceId: crew.id, email: f.users.mert!.email, role: 'editor' })).resolves.toEqual({ status: 'added' });
    expect((await f.repository.listMembers(crew.id)).map((m) => m.email)).toContain(f.users.mert!.email);
    const elif = f.users.elif!.email;
    await expect(f.repository.inviteMember({ workspaceId: f.workspaces.team!, email: ` ${elif.toUpperCase()}`, role: 'editor' }))
      .rejects.toMatchObject({ code: 'conflict', message: `${elif} is already a member.` });
  });

  it('refuses personal workspaces, bad input and non-owners', async () => {
    const f = await makeFixture();
    await expect(f.repository.inviteMember({ workspaceId: f.workspaces.personal, email: 'someone@example.com', role: 'editor' }))
      .rejects.toMatchObject({ code: 'validation', message: 'Invite people to a team workspace.' });
    await expect(f.repository.inviteMember({ workspaceId: f.workspaces.team!, email: 'not an email', role: 'editor' }))
      .rejects.toMatchObject({ code: 'validation', message: 'Check the email and role.' });
    const editor = await makeFixture({ teamRole: 'editor' });
    await expect(editor.repository.inviteMember({ workspaceId: editor.workspaces.team!, email: 'someone@example.com', role: 'viewer' }))
      .rejects.toMatchObject({ code: 'forbidden' });
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
    await f.repository.updateMemberRole({ workspaceId: team, userId: f.users.elif!.id, role: 'editor' });
    await f.repository.updateMemberRole({ workspaceId: team, userId: f.users.mert!.id, role: 'viewer' });
    const lastOwner = { code: 'validation', message: 'A workspace needs at least one owner.' };
    await expect(f.repository.updateMemberRole({ workspaceId: team, userId: f.users.current.id, role: 'editor' })).rejects.toMatchObject(lastOwner);
    await expect(f.repository.removeMember({ workspaceId: team, userId: f.users.current.id })).rejects.toMatchObject(lastOwner);
    await f.repository.removeMember({ workspaceId: team, userId: f.users.elif!.id });
    await expect(f.repository.removeMember({ workspaceId: team, userId: f.users.elif!.id }))
      .rejects.toMatchObject({ code: 'validation', message: 'This person is no longer a member.' });
    expect((await f.repository.listMembers(team)).map((m) => [m.email, m.role])).toEqual([[f.users.current.email, 'owner'], [f.users.mert!.email, 'viewer']]);
  });

  it('lets only owners manage members', async () => {
    const f = await makeFixture({ teamRole: 'editor' });
    await expect(f.repository.updateMemberRole({ workspaceId: f.workspaces.team!, userId: f.users.elif!.id, role: 'editor' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(f.repository.removeMember({ workspaceId: f.workspaces.team!, userId: f.users.elif!.id })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('keeps viewers from creating projects and schedules', async () => {
    const f = await makeFixture({ teamRole: 'viewer' });
    const tunnel = f.projectIds['T-01']!;
    await expect(f.repository.createProject(makeNewProjectInput(f.workspaces.team!, { code: 'V-1' }))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(f.repository.createSchedule({ projectId: tunnel, name: 'Nope' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(f.repository.importSchedule({ projectId: tunnel, name: 'Nope', file: new File(['x'], 'x.xer') })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('updates my name', async () => {
    const f = await makeFixture();
    await expect(f.repository.updateProfile({ firstName: ' Ada ', lastName: 'Lovelace' })).resolves.toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
    expect(await f.repository.getCurrentUser()).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/lib src/data src/test/contract` → FAIL (missing types, methods and seed data).

- [ ] **Step 3: Implement** everything in Interfaces. The mock runner passes `teamRole` through and sets `pendingInvitationEmail` from the store (`null` in the empty scenario). Add `VITE_MOCK_TEAM_ROLE=owner` to `.env.example`.

- [ ] **Step 4: Run** `npm run check` → all checks pass (the Phase 1 suites included).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add roles, members and invitations to the mock data layer"
```

---

### Task 4: `AuthService` v2 and the sign-in page

**Spec:** §5.3, §5.4, §5.5 (`/sign-in` row, validation copy, Google mark), §9 (auth contract, auth UI).

**Files:**
- Create: `src/auth/auth-options.ts`, `src/hooks/useAuthActions.ts`, `src/components/common/GoogleMark.tsx`, `src/test/contract/auth.contract.ts`, `src/test/contract/mock-auth.contract.test.ts`, `e2e/auth.spec.ts`
- Modify: `src/data/auth.ts` (§5.3 verbatim), `src/data/mock/MockAuthService.ts`, `src/auth/AuthProvider.tsx`, `src/pages/SignInPage.tsx`, `src/test/fakes.ts` (`createFakeAuth`), `src/test/render.tsx` (`route` also takes a location object), `src/vite-env.d.ts` (`VITE_GOOGLE_SIGN_IN`), `.env.example` (commented `# VITE_GOOGLE_SIGN_IN=true`)
- Test: `src/data/mock/MockAuthService.test.ts` (replaced), `src/auth/auth.test.tsx` (extended), `src/auth/auth-options.test.ts`, `src/components/common/GoogleMark.test.tsx`, `src/pages/SignInPage.test.tsx` (replaced)

**Interfaces:**
- Consumes: `RepositoryError`, `errorMessage` (Task 3); `renderWithProviders`, `createTestDataLayer` (Phase 1).
- Produces:
  ```ts
  // src/auth/AuthProvider.tsx
  export function useAuth(): { status: AuthStatus; session: Session | null; signOut(): Promise<void> };
  // src/auth/auth-options.ts
  export function authOptions(env?: { VITE_DATA_SOURCE?: string; VITE_GOOGLE_SIGN_IN?: string }): { demo: boolean; google: boolean };
  //   default env: import.meta.env; demo = (VITE_DATA_SOURCE ?? 'mock') === 'mock'; google = demo || VITE_GOOGLE_SIGN_IN === 'true'
  // src/hooks/useAuthActions.ts
  export function useSignInWithPassword(): UseMutationResult<void, unknown, { email: string; password: string }>;
  export function useSignInWithGoogle(): UseMutationResult<void, unknown, string | null>; // variable: the `next` path
  // src/components/common/GoogleMark.tsx
  export function GoogleMark(props: { src?: string | null; className?: string }): ReactElement | null;
  //   default src: the first value of import.meta.glob<string>('/src/assets/third-party/google-g.svg', { eager: true, query: '?url', import: 'default' }), else null
  //   renders <img src alt="" aria-hidden="true" class="size-4"> or nothing
  // src/test/fakes.ts
  export function createFakeAuth(initial?: Session | null): { auth: AuthService; emit(session: Session | null): void };
  // src/test/contract/auth.contract.ts
  export interface AuthFixture { auth: AuthService; email: string; password: string; badPassword: string; freshToken(): Promise<string> }
  export function runAuthContract(label: string, makeFixture: () => Promise<AuthFixture>): void;
  ```
- `MockAuthService` v2 follows P2 spec §5.3. `updatePassword` without a session rejects with `RepositoryError('unauthorized', 'Your session expired. Please sign in again.')`.
- `AuthProvider`:
  - **Clearing the cache:** keep the last `userId` in a ref. When a listener call moves from a user to `null` or to a different user, call `queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' })`. `signOut()` only calls `auth.signOut()`; the listener does the clearing.
  - **Session expiry:**
    1. Subscribe to `queryClient.getQueryCache()` and `queryClient.getMutationCache()`.
    2. Act on an `updated` event whose action is `error` with a `RepositoryError` of code `unauthorized`, only while the status is `signed-in` and the guard ref is clear.
    3. Then set the guard, call `toast.error('Your session expired. Please sign in again.', { id: 'session-expired' })` and `void auth.signOut()`.
    4. The guard resets on the next sign-in.
- `SignInPage`:
  - Layout and copy follow P2 spec §5.5; the zod schema checks the email ("Enter a valid email address") and a non-empty password ("Enter your password").
  - The password input toggles between `type="password"` and `"text"` with an icon button labelled "Show password" / "Hide password".
  - `autocomplete`: `email` and `current-password`.
  - A failed sign-in shows `<p role="alert">` above the primary button: the error's message for `unauthorized`, otherwise `errorMessage(error)`.
  - `location.state.authError` (`'no-access' | 'failed'`) shows the matching banner (`role="alert"`) at the top of the card.
  - The Google button is shown when `authOptions().google`. Its `next` is `state.from` as `pathname + search + hash`, or `null`.
  - Signed-in visitors still go to `state.from` or `/home`.

- [ ] **Step 1: Write the failing tests**

`src/test/contract/auth.contract.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AuthService } from '@/data/auth';

export interface AuthFixture { auth: AuthService; email: string; password: string; badPassword: string; freshToken(): Promise<string> }
const expired = { code: 'validation', message: 'This link has expired or was already used.' };

export function runAuthContract(label: string, makeFixture: () => Promise<AuthFixture>): void {
  describe(`AuthService contract — ${label}`, () => {
    it('signs in with the right password and out again, telling listeners', async () => {
      const f = await makeFixture();
      const seen: Array<string | null> = [];
      const off = f.auth.onAuthStateChange((s) => seen.push(s?.userId ?? null));
      await f.auth.signOut();
      expect(await f.auth.getSession()).toBeNull();
      await f.auth.signInWithPassword(f.email, f.password);
      expect(await f.auth.getSession()).not.toBeNull();
      await vi.waitFor(() => expect(seen.at(-1)).not.toBeNull());
      expect(seen).toContain(null);
      off();
    });

    it('refuses a wrong password with the pinned message', async () => {
      const f = await makeFixture();
      await f.auth.signOut();
      await expect(f.auth.signInWithPassword(f.email, f.badPassword)).rejects.toMatchObject({ code: 'unauthorized', message: 'Wrong email or password' });
    });

    it('accepts a reset request for an unknown email', async () => {
      const f = await makeFixture();
      await expect(f.auth.requestPasswordReset(`nobody.${Date.now()}@example.com`)).resolves.toBeUndefined();
    });

    it('verifies an email link once', async () => {
      const f = await makeFixture();
      await f.auth.signOut();
      const token = await f.freshToken();
      await f.auth.verifyEmailLink(token, 'recovery');
      expect(await f.auth.getSession()).not.toBeNull();
      await expect(f.auth.verifyEmailLink(token, 'recovery')).rejects.toMatchObject(expired);
      await expect(f.auth.verifyEmailLink('expired', 'recovery')).rejects.toMatchObject(expired);
    });
  });
}
```

`src/test/contract/mock-auth.contract.test.ts`:

```ts
import { runAuthContract } from '@/test/contract/auth.contract';
import { createTestDataLayer } from '@/test/fakes';

runAuthContract('mock', async () => ({
  auth: createTestDataLayer().auth,
  email: 'deniz.kaya@example.com',
  password: 'any-password-1',
  badPassword: 'wrong-password',
  freshToken: async () => crypto.randomUUID(),
}));
```

`src/data/mock/MockAuthService.test.ts` (replaces the Phase 1 file):

```ts
import { expect, it } from 'vitest';
import { MockAuthService } from '@/data/mock/MockAuthService';
import { createMockStore } from '@/data/mock/store';
import { createMemoryStorage } from '@/lib/storage';

it('signs in through Google at once and needs a session to change the password', async () => {
  const store = createMockStore({ storage: createMemoryStorage(), scenario: 'default' });
  const auth = new MockAuthService({ store });
  await auth.signOut();
  await expect(auth.updatePassword('letters12345')).rejects.toMatchObject({ code: 'unauthorized' });
  await auth.signInWithGoogle(null);
  expect(await auth.getSession()).toEqual({ userId: store.read().currentUserId });
  await expect(auth.updatePassword('letters12345')).resolves.toBeUndefined();
});
```

`src/auth/auth.test.tsx` — add (keep the three Phase 1 cases):

```tsx
it('keeps the cache on sign-in and clears it, except auth keys, when the user changes', async () => {
  const { auth, emit } = createFakeAuth();
  const { queryClient } = renderWithProviders(<p>App</p>, { dataLayer: { ...createTestDataLayer(), auth } });
  await screen.findByText('App');
  queryClient.setQueryData(['me'], { firstName: 'Nobody' });
  queryClient.setQueryData(['auth', 'callback', 'x'], true);
  act(() => emit({ userId: 'a' }));
  expect(queryClient.getQueryData(['me'])).toBeDefined();
  act(() => emit({ userId: 'b' }));
  expect(queryClient.getQueryData(['me'])).toBeUndefined();
  expect(queryClient.getQueryData(['auth', 'callback', 'x'])).toBe(true);
});

it('signs out once, with one toast, when several queries fail with unauthorized', async () => {
  const expiredSession = () => Promise.reject(new RepositoryError('unauthorized', 'JWT expired'));
  const dataLayer = createTestDataLayer({ overrides: { listWorkspaces: expiredSession, listPendingTasks: expiredSession } });
  const signOut = vi.spyOn(dataLayer.auth, 'signOut');
  function Two() { useWorkspaces(); usePendingTasks(); return null; }
  // Inside RequireAuth, the queries mount only after the session resolves, so their failures arrive while signed in.
  renderWithProviders(<RequireAuth><Two /></RequireAuth>, { dataLayer });
  expect(await screen.findByText('Your session expired. Please sign in again.')).toBeInTheDocument();
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  expect(screen.getAllByText('Your session expired. Please sign in again.')).toHaveLength(1);
});
```

`src/pages/SignInPage.test.tsx` (replaces the Phase 1 file):

```tsx
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignInPage } from '@/pages/SignInPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function signedOut() {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  return dataLayer;
}
const at = (state?: unknown) => ({ route: { pathname: '/sign-in', state }, path: '/sign-in' });

afterEach(() => { vi.unstubAllEnvs(); });

describe('SignInPage', () => {
  it('signs in with email and password in demo mode', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    expect(await screen.findByText('Demo mode: any email and password sign you in.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    await user.type(screen.getByLabelText('Email'), 'lab@example.com');
    await user.type(screen.getByLabelText('Password'), 'any-password-1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });

  it('validates both fields', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    await user.type(await screen.findByLabelText('Email'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
  });

  it('explains a wrong password without ending any session', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    await user.type(await screen.findByLabelText('Email'), 'deniz.kaya@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
    expect(screen.queryByText('Your session expired. Please sign in again.')).not.toBeInTheDocument();
  });

  it('shows and hides the password', async () => {
    const { user } = renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    const input = await screen.findByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('continues with Google and returns to the requested page', async () => {
    const dataLayer = await signedOut();
    const google = vi.spyOn(dataLayer.auth, 'signInWithGoogle');
    const { user } = renderWithProviders(<SignInPage />, { ...at({ from: { pathname: '/w/x/projects', search: '', hash: '' } }), dataLayer });
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(google).toHaveBeenCalledWith('/w/x/projects');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/w/x/projects'));
  });

  it.each([
    ['no-access', 'This Google account has no access yet. Ask a workspace owner to invite you.'],
    ['failed', "Google sign-in didn't work. Please try again."],
  ])('shows the %s banner from the callback', async (authError, copy) => {
    renderWithProviders(<SignInPage />, { ...at({ authError }), dataLayer: await signedOut() });
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it('explains invite-only access and hides Google when it is off', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'supabase');
    renderWithProviders(<SignInPage />, { ...at(), dataLayer: await signedOut() });
    expect(await screen.findByText('Access is by invitation. Ask a workspace owner to invite you.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
  });

  it('sends signed-in visitors to Home', async () => {
    renderWithProviders(<SignInPage />, at());
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
  });
});
```

`src/auth/auth-options.test.ts`:

```ts
import { expect, it } from 'vitest';
import { authOptions } from '@/auth/auth-options';

it.each([
  [{}, { demo: true, google: true }],
  [{ VITE_DATA_SOURCE: 'supabase' }, { demo: false, google: false }],
  [{ VITE_DATA_SOURCE: 'supabase', VITE_GOOGLE_SIGN_IN: 'true' }, { demo: false, google: true }],
])('authOptions(%o)', (env, expected) => {
  expect(authOptions(env)).toEqual(expected);
});
```

`src/components/common/GoogleMark.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GoogleMark } from '@/components/common/GoogleMark';

it('renders the owner-supplied mark only when a file exists', () => {
  const { container, rerender } = render(<GoogleMark src="/mark.svg" />);
  expect(container.querySelector('img')).toHaveAttribute('src', '/mark.svg');
  expect(container.querySelector('img')).toHaveAttribute('alt', '');
  rerender(<GoogleMark src={null} />);
  expect(container.firstChild).toBeNull();
});
```

`e2e/auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Account menu for Deniz Kaya' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('signing back in with a password', async ({ page }) => {
  await page.getByLabel('Email', { exact: true }).fill('deniz.kaya@example.com');
  await page.getByLabel('Password', { exact: true }).fill('any-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
});

test('continuing with Google in demo mode', async ({ page }) => {
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/auth src/pages src/data/mock src/components/common src/test/contract` → FAIL.

- [ ] **Step 3: Implement** everything in Interfaces. Any Phase 1 code that called `useAuth().signInWithEmail` now uses the hooks.

- [ ] **Step 4: Run** `npm run check && npm run test:e2e` → all pass (the Phase 1 e2e suite plus `e2e/auth.spec.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: move to AuthService v2 with password and Google sign-in"
```

---

### Task 5: Email-link pages and the Google callback

**Spec:** §5.2 (verify on submit), §5.3, §5.4 (hooks), §5.5 (rows `/forgot-password`, `/reset-password`, `/accept-invite`, `/auth/callback`), §6.3 (`useOAuthCallback`).

**Files:**
- Create: `src/auth/safe-next.ts`, `src/features/auth/AuthCard.tsx`, `src/features/auth/password-schema.ts`, `src/pages/ForgotPasswordPage.tsx`, `src/pages/ResetPasswordPage.tsx`, `src/pages/AcceptInvitePage.tsx`, `src/pages/AuthCallbackPage.tsx`
- Modify: `src/hooks/useAuthActions.ts`, `src/hooks/query-keys.ts`, `src/app/router.tsx`, `src/pages/SignInPage.tsx` (uses `AuthCard`)
- Test: `src/auth/safe-next.test.ts`, `src/features/auth/password-schema.test.ts`, `src/pages/ForgotPasswordPage.test.tsx`, `src/pages/ResetPasswordPage.test.tsx`, `src/pages/AcceptInvitePage.test.tsx`, `src/pages/AuthCallbackPage.test.tsx`

**Interfaces:**
- Consumes: `useAuth`, `authOptions` (Task 4); `useRepository`, `useAuthService` (Phase 1).
- Produces:
  ```ts
  export function safeNext(next: string | null | undefined): string; // starts with '/' but not '//' or '/\' → next; else '/home'
  export function AuthCard(props: { title: string; description?: string; children: ReactNode }): ReactElement; // Phase 1 sign-in card
  export const PASSWORD_RULE: RegExp;   // /^(?=.*[A-Za-z])(?=.*\d).{10,}$/
  export const newPasswordSchema;       // { password, confirm } → "Use at least 10 characters with letters and numbers" · "Passwords don't match"
  export const personNameSchema;        // trimmed 1–60 → "Enter your first name" / "Enter your last name" · "Use 60 characters or fewer"
  export function useRequestPasswordReset(): UseMutationResult<void, unknown, string>;
  export function useResetPassword(): UseMutationResult<void, unknown, { tokenHash: string; password: string }>;
  export function useAcceptInvite(): UseMutationResult<void, unknown, { tokenHash: string; firstName: string; lastName: string; password: string }>;
  export function useOAuthCallback(href: string): UseQueryResult<true>;
  // query-keys
  authCallback(href: string): readonly ['auth', 'callback', string];
  ```
- Pins:
  - **Remembering a used token:** `useResetPassword` and `useAcceptInvite` keep the last verified token in a ref, and a later call with the same token skips `verifyEmailLink`. `useAcceptInvite` runs verify → `updatePassword` → `repository.updateProfile` and then invalidates `['me']`.
  - **Expired card:** the pages read `token_hash` from the query string. With no token, or after a `validation` rejection from verification, the form is replaced by the expired card (P2 spec §5.5 copy and links). Other errors → `toast.error(errorMessage(error))`, and the form stays.
  - **After success:** Reset shows `toast.success('Password updated')` and navigates to `/home` (replace). Accept navigates to `/home` (replace) with no toast. Forgot replaces the form with the confirmation copy.
  - **Field details:**
    - `autocomplete` values: `email`, `new-password`, `given-name`, `family-name`.
    - The hint "At least 10 characters, with letters and numbers" sits under the password field through `aria-describedby`.
    - Accept shows "Next time you can also continue with Google." when `authOptions().google`.
  - **Callback page:**
    - It builds `href` from the router location: `window.location.origin + pathname + search + hash`.
    - While pending it shows a `Loader2` spinner with `role="status"` and "Signing you in…".
    - On success, once `useAuth().status === 'signed-in'`, it renders `<Navigate to={safeNext(next)} replace />`.
    - On error it renders `<Navigate to="/sign-in" replace state={{ authError: code === 'forbidden' ? 'no-access' : 'failed' }} />`.
  - **Routes:** `/forgot-password`, `/reset-password`, `/accept-invite` and `/auth/callback` sit next to `/sign-in`, outside `RequireAuth` and `AppShell`.

- [ ] **Step 1: Write the failing tests**

`src/auth/safe-next.test.ts`:

```ts
import { expect, it } from 'vitest';
import { safeNext } from '@/auth/safe-next';

it.each([
  ['/w/1/projects?x=1', '/w/1/projects?x=1'], [null, '/home'], [undefined, '/home'], ['', '/home'],
  ['//evil.example', '/home'], ['/\\evil.example', '/home'], ['https://evil.example', '/home'],
])('safeNext(%s) → %s', (input, expected) => {
  expect(safeNext(input)).toBe(expected);
});
```

`src/features/auth/password-schema.test.ts`:

```ts
import { expect, it } from 'vitest';
import { newPasswordSchema } from '@/features/auth/password-schema';

const issues = (password: string, confirm: string) =>
  newPasswordSchema.safeParse({ password, confirm }).error?.issues.map((i) => i.message) ?? [];

it('needs 10 characters with letters and numbers, typed twice', () => {
  expect(issues('short12', 'short12')).toEqual(['Use at least 10 characters with letters and numbers']);
  expect(issues('onlyletterspassword', 'onlyletterspassword')).toEqual(['Use at least 10 characters with letters and numbers']);
  expect(issues('letters12345', 'letters12346')).toEqual(["Passwords don't match"]);
  expect(issues('letters12345', 'letters12345')).toEqual([]);
});
```

`src/pages/ResetPasswordPage.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import { ResetPasswordPage } from '@/pages/ResetPasswordPage';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

async function open(query: string) {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  const verify = vi.spyOn(dataLayer.auth, 'verifyEmailLink');
  const utils = renderWithProviders(<ResetPasswordPage />, { route: `/reset-password${query}`, path: '/reset-password', dataLayer });
  return { ...utils, dataLayer, verify };
}
async function submit(user: Awaited<ReturnType<typeof open>>['user'], password = 'letters12345', confirm = password) {
  await user.type(await screen.findByLabelText('New password'), password);
  await user.type(screen.getByLabelText('Confirm password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Save password' }));
}

describe('ResetPasswordPage', () => {
  it('shows the expired card without a token', async () => {
    await open('');
    expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('uses the token only when the form is submitted', async () => {
    const { user, verify } = await open('?token_hash=abc&type=recovery');
    await screen.findByLabelText('New password');
    expect(verify).not.toHaveBeenCalled();
    await submit(user);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
    expect(verify).toHaveBeenCalledWith('abc', 'recovery');
    expect(await screen.findByText('Password updated')).toBeInTheDocument();
  });

  it('validates the new password', async () => {
    const { user } = await open('?token_hash=abc');
    await submit(user, 'short12', 'short13');
    expect(await screen.findByText('Use at least 10 characters with letters and numbers')).toBeInTheDocument();
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
  });

  it('shows the expired card when the link was already used', async () => {
    const { user } = await open('?token_hash=expired');
    await submit(user);
    expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument();
  });

  it('retries after a failure without verifying twice', async () => {
    const { user, dataLayer, verify } = await open('?token_hash=abc');
    vi.spyOn(dataLayer.auth, 'updatePassword').mockRejectedValueOnce(new RepositoryError('network', 'offline'));
    await submit(user);
    expect(await screen.findByText("Can't reach the server. Check your connection and try again.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
```

`src/pages/AcceptInvitePage.test.tsx`:

```tsx
describe('AcceptInvitePage', () => {
  it('shows the expired card without a token', async () => {
    renderWithProviders(<AcceptInvitePage />, { route: '/accept-invite', path: '/accept-invite' });
    expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument();
    expect(screen.getByText('Ask the person who invited you to send a new invitation.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in');
  });

  it('sets the name and password, then opens Home', async () => {
    const dataLayer = createTestDataLayer();
    await dataLayer.auth.signOut();
    const verify = vi.spyOn(dataLayer.auth, 'verifyEmailLink');
    const { user } = renderWithProviders(<AcceptInvitePage />, { route: '/accept-invite?token_hash=inv&type=invite', path: '/accept-invite', dataLayer });
    expect(await screen.findByRole('heading', { name: 'Welcome to AppName' })).toBeInTheDocument();
    expect(screen.getByText('Next time you can also continue with Google.')).toBeInTheDocument();
    expect(verify).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('First name'), ' Ada ');
    await user.type(screen.getByLabelText('Last name'), 'Lovelace');
    await user.type(screen.getByLabelText('Password'), 'letters12345');
    await user.type(screen.getByLabelText('Confirm password'), 'letters12345');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/home'));
    expect(verify).toHaveBeenCalledWith('inv', 'invite');
    expect(await dataLayer.repository.getCurrentUser()).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('asks for both names', async () => {
    const { user } = renderWithProviders(<AcceptInvitePage />, { route: '/accept-invite?token_hash=inv', path: '/accept-invite' });
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your first name')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name')).toBeInTheDocument();
  });
});
```
(Imports as in the Reset test. The same "retry without verifying twice" rule is covered for Reset; both hooks share the ref helper.)

`src/pages/ForgotPasswordPage.test.tsx`:

```tsx
it('confirms the request without revealing whether the account exists', async () => {
  const { user } = renderApp('/forgot-password', { dataLayer: await signedOutLayer() });
  expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
  await user.type(screen.getByLabelText('Email'), 'lab@example.com');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByText('If an account exists for lab@example.com, a reset link is on its way.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/sign-in');
});

it('validates the email', async () => {
  const { user } = renderApp('/forgot-password', { dataLayer: await signedOutLayer() });
  await user.type(await screen.findByLabelText('Email'), 'nope');
  await user.click(screen.getByRole('button', { name: 'Send reset link' }));
  expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
});
```
(`signedOutLayer()` is a local helper like Task 4's `signedOut()`. Using `renderApp` also proves the route renders outside `RequireAuth`.)

`src/pages/AuthCallbackPage.test.tsx`:

```tsx
async function callback(query: string, complete: (layer: TestDataLayer) => () => Promise<void>) {
  const dataLayer = createTestDataLayer();
  await dataLayer.auth.signOut();
  vi.spyOn(dataLayer.auth, 'completeOAuthSignIn').mockImplementation(complete(dataLayer));
  return renderApp(`/auth/callback${query}`, { dataLayer });
}
const signsIn = (layer: TestDataLayer) => () => layer.auth.signInWithPassword('deniz.kaya@example.com', 'any-password-1');
const fails = (code: 'forbidden' | 'unauthorized') => () => () => Promise.reject(new RepositoryError(code, 'x'));

describe('AuthCallbackPage', () => {
  it('opens the requested page after signing in', async () => {
    const { router } = await callback(`?code=abc&next=${encodeURIComponent('/library')}`, signsIn);
    await waitFor(() => expect(router.state.location.pathname).toBe('/library'));
  });

  it('ignores a next value that leaves the app', async () => {
    const { router } = await callback(`?code=abc&next=${encodeURIComponent('//evil.example')}`, signsIn);
    await waitFor(() => expect(router.state.location.pathname).toBe('/home'));
  });

  it.each([
    ['forbidden', 'This Google account has no access yet. Ask a workspace owner to invite you.'],
    ['unauthorized', "Google sign-in didn't work. Please try again."],
  ] as const)('sends a %s result back to sign-in with its banner', async (code, copy) => {
    const { router } = await callback('?error=x', fails(code));
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sign-in');
  });

  it('says it is signing in while waiting', async () => {
    await callback('?code=abc', () => () => new Promise(() => {}));
    expect(await screen.findByRole('status')).toHaveTextContent('Signing you in…');
  });
});
```
(`renderApp` returns the memory router, so these tests read `router.state.location` instead of a location probe.)

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/auth src/features/auth src/pages` → FAIL.

- [ ] **Step 3: Implement** everything in Interfaces, and register the routes.

- [ ] **Step 4: Run** `npm run check` → all checks pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add reset, invite-acceptance and Google callback pages"
```

---

### Task 6: Members dialog

**Spec:** §5.8, §6.3 (member hooks), §5.7 (resend), §9 (E2E mock: members dialog).

**Files:**
- Create: `src/features/workspaces/roles.ts`, `src/features/workspaces/member-schema.ts`, `src/features/workspaces/WorkspaceMembersDialog.tsx`, `src/hooks/useMembers.ts`, `e2e/members.spec.ts`
- Modify:
  - `src/hooks/query-keys.ts`
  - `src/features/dialogs/DialogsProvider.tsx` (`DialogKind` gains `'workspaceMembers'`; `DialogOptions` gains `workspaceId?: ID`)
  - `src/features/dialogs/DialogHost.tsx`, `src/features/home/WorkspacesPanel.tsx`
  - `src/features/home/WorkspacesPanel.test.tsx` and `e2e/home.spec.ts`: the workspace-row locators become `/^Site Operations/` and `/^Field crew/`, because the new "Members of …" buttons also contain the name
- Test: `src/features/workspaces/roles.test.ts`, `src/features/workspaces/WorkspaceMembersDialog.test.tsx`, `src/features/home/WorkspacesPanel.test.tsx`

**Interfaces:**
- Consumes: the `DataRepository` member methods (Task 3); `useDialogs`, `OpenDialog`, `SectionError`, `relativeTime`, `initials`, `fullName`, `useNow`, `errorMessage` (Phase 1).
- Produces:
  ```ts
  // src/features/workspaces/roles.ts
  export const ROLES: readonly ['owner', 'editor', 'viewer'];
  export const ROLE_LABELS: Record<Role, string>;        // Owner · Editor · Viewer
  export const ROLE_DESCRIPTIONS: Record<Role, string>;  // P2 spec §5.8 copy
  export function canEdit(workspace: { myRole: Role } | null | undefined): boolean; // owner or editor; true while unknown (RLS still decides)
  export function isOwner(workspace: { myRole: Role } | null | undefined): boolean;
  // src/features/workspaces/member-schema.ts
  export const inviteSchema; // { email: trimmed valid email "Enter a valid email address", role: z.enum(ROLES) }; default role 'editor'
  // src/hooks/query-keys.ts (added)
  members(workspaceId: ID): readonly ['members', ID]; membersAll(): readonly ['members']; invitations(workspaceId: ID): readonly ['invitations', ID];
  // src/hooks/useMembers.ts
  export function useWorkspaceMembers(workspaceId: ID): UseQueryResult<WorkspaceMember[]>;
  export function useWorkspaceInvitations(workspaceId: ID, enabled: boolean): UseQueryResult<WorkspaceInvitation[]>;
  export function useInviteMember(workspaceId: ID): UseMutationResult<InviteResult, unknown, { email: string; role: Role }>;
  export function useRevokeInvitation(workspaceId: ID): UseMutationResult<void, unknown, ID>;
  export function useUpdateMemberRole(workspaceId: ID): UseMutationResult<void, unknown, { userId: ID; role: Role }>;
  export function useRemoveMember(workspaceId: ID): UseMutationResult<void, unknown, { userId: ID }>;
  // src/features/workspaces/WorkspaceMembersDialog.tsx
  export function WorkspaceMembersDialog(props: { workspaceId: ID }): ReactElement;
  ```
- Pins:
  - **Hook invalidation:** per P2 spec §6.3. `useInviteMember` invalidates in `onSettled`.
  - **Dialog shell:** the shadcn `Dialog`, open while active, width 640. Title and description per P2 spec §5.8, with the owner/other description chosen by `isOwner`. Header close button labelled "Close". No footer.
  - **Invite form:** `<form noValidate aria-label="Invite people">` with:
    - "Email" (`type="email"`, `autocomplete="off"`);
    - "Role" (shadcn `Select`; each item shows the label plus its description in `text-xs` muted);
    - "Send invite" / "Sending…".
    The form sends `email.trim().toLowerCase()`. Success toasts per P2 spec §5.8, then the email field clears. Failure → `toast.error(errorMessage(error))`.
  - **Members list:** an `<h3>` "Members" and `<ul aria-label="Members">`. Each `<li>` has a 28 px initials avatar, the name (or the email when empty) and the email.
    - Owners see a role `Select` (trigger aria-label "Role for {name}") and an icon button (`UserMinus`, aria-label "Remove {name}") on every row but their own.
    - Others see the role label as text.
    - Role change → "Role updated". Removal goes through the AlertDialog from §5.8 → "{name} was removed".
  - **Pending list** (owners only, hidden when empty): an `<h3>` "Pending invitations" and `<ul aria-label="Pending invitations">`. Each row shows the email, the role label and "Invited {relativeTime(invitedAt, now)}".
    - Visible "Resend" button with aria-label "Resend invitation to {email}"; it calls `useInviteMember` with the row's email and role.
    - Visible "Revoke" button with aria-label "Revoke invitation to {email}".
  - **States:** loading shows 3 skeleton rows per list (`data-testid="member-row-skeleton"`); a list error shows `SectionError`.
  - **`WorkspacesPanel`:** each row becomes `<div className="flex items-center">` holding the existing row `<button>` (`flex-1`).
    - Team rows add a ghost icon button: `UserCog`, 32×32, aria-label "Members of {name}", which calls `openDialog('workspaceMembers', { workspaceId })`.
    - Personal rows add an `aria-hidden` 32 px spacer.

- [ ] **Step 1: Write the failing tests**

`src/features/workspaces/roles.test.ts`:

```ts
import { expect, it } from 'vitest';
import { canEdit, isOwner, ROLE_DESCRIPTIONS } from '@/features/workspaces/roles';

it('derives what a role may do', () => {
  expect([canEdit({ myRole: 'owner' }), canEdit({ myRole: 'editor' }), canEdit({ myRole: 'viewer' }), canEdit(undefined)]).toEqual([true, true, false, true]);
  expect([isOwner({ myRole: 'owner' }), isOwner({ myRole: 'editor' }), isOwner(null)]).toEqual([true, false, false]);
  expect(ROLE_DESCRIPTIONS).toEqual({
    owner: 'Manages members and settings',
    editor: 'Creates and edits projects and schedules',
    viewer: 'Can view everything but change nothing',
  });
});
```

`src/features/workspaces/WorkspaceMembersDialog.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryError } from '@/data/errors';
import type { Role } from '@/data/types';
import { createTestDataLayer } from '@/test/fakes';
import { OpenDialog, renderWithProviders } from '@/test/render';

async function openMembers(options: { teamRole?: Role } = {}) {
  const dataLayer = createTestDataLayer(options);
  const team = dataLayer.store.read().workspaces.find((w) => w.kind === 'team')!;
  const utils = renderWithProviders(<OpenDialog kind="workspaceMembers" options={{ workspaceId: team.id }} />, { route: '/home', path: '/home', dataLayer });
  const dialog = await screen.findByRole('dialog', { name: 'Members of Site Operations' });
  await within(dialog).findByText('Elif Arslan');
  return { ...utils, dialog, dataLayer };
}

describe('WorkspaceMembersDialog', () => {
  it('shows members, roles and pending invitations to owners', async () => {
    const { dialog } = await openMembers();
    expect(within(dialog).getByText('Invite people and choose what they can do.')).toBeInTheDocument();
    const rows = within(within(dialog).getByRole('list', { name: 'Members' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining('Deniz Kaya'), expect.stringContaining('Mert Demir'), expect.stringContaining('Elif Arslan')]);
    expect(within(dialog).queryByRole('button', { name: 'Remove Deniz Kaya' })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove Elif Arslan' })).toBeInTheDocument();
    const pending = within(dialog).getByRole('list', { name: 'Pending invitations' });
    expect(pending).toHaveTextContent('site.planner@example.com');
    expect(pending).toHaveTextContent('Invited 2 days ago');
  });

  it('invites by email and lists the pending invitation', async () => {
    const { dialog, user } = await openMembers();
    await user.type(within(dialog).getByLabelText('Email'), ' New.Person@Example.com ');
    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText('Invitation sent to new.person@example.com')).toBeInTheDocument();
    expect(await within(dialog).findByRole('button', { name: 'Revoke invitation to new.person@example.com' })).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toHaveValue('');
  });

  it('reports someone who is already a member', async () => {
    const { dialog, user } = await openMembers();
    await user.type(within(dialog).getByLabelText('Email'), 'elif.arslan@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(await screen.findByText('elif.arslan@example.com is already a member.')).toBeInTheDocument();
  });

  it('changes a role', async () => {
    const { dialog, user } = await openMembers();
    await user.click(within(dialog).getByRole('combobox', { name: 'Role for Elif Arslan' }));
    await user.click(await screen.findByRole('option', { name: /^Editor/ }));
    expect(await screen.findByText('Role updated')).toBeInTheDocument();
  });

  it('removes a member after confirmation', async () => {
    const { dialog, user } = await openMembers();
    await user.click(within(dialog).getByRole('button', { name: 'Remove Elif Arslan' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Remove Elif Arslan from Site Operations?' });
    expect(within(confirm).getByText('They lose access to its projects and schedules.')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Elif Arslan was removed')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByText('Elif Arslan')).not.toBeInTheDocument());
  });

  it('resends and revokes invitations', async () => {
    const { dialog, user } = await openMembers();
    await user.click(within(dialog).getByRole('button', { name: 'Resend invitation to site.planner@example.com' }));
    expect(await screen.findByText('Invitation sent to site.planner@example.com')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke invitation to site.planner@example.com' }));
    expect(await screen.findByText('Invitation revoked')).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).queryByRole('list', { name: 'Pending invitations' })).not.toBeInTheDocument());
  });

  it('shows the server message when the last owner would be lost', async () => {
    const { dialog, user, dataLayer } = await openMembers();
    vi.spyOn(dataLayer.repository, 'updateMemberRole').mockRejectedValue(new RepositoryError('validation', 'A workspace needs at least one owner.'));
    await user.click(within(dialog).getByRole('combobox', { name: 'Role for Mert Demir' }));
    await user.click(await screen.findByRole('option', { name: /^Viewer/ }));
    expect(await screen.findByText('A workspace needs at least one owner.')).toBeInTheDocument();
  });

  it('is read-only for people who are not owners', async () => {
    const { dialog } = await openMembers({ teamRole: 'viewer' });
    expect(within(dialog).getByText('People who can open this workspace.')).toBeInTheDocument();
    expect(within(dialog).queryByRole('form', { name: 'Invite people' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('list', { name: 'Pending invitations' })).not.toBeInTheDocument();
    expect(within(dialog).queryAllByRole('combobox')).toHaveLength(0);
    expect(within(dialog).queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
  });
});
```

`src/features/home/WorkspacesPanel.test.tsx` — add (and switch the Phase 1 locator to `/^Site Operations/`):

```tsx
it('opens the members of a team workspace', async () => {
  const { user } = renderWithProviders(<WorkspacesPanel />, { route: '/home', path: '/home' });
  const members = await screen.findByRole('button', { name: 'Members of Site Operations' });
  expect(screen.queryByRole('button', { name: 'Members of My workspace' })).not.toBeInTheDocument();
  await user.click(members);
  expect(await screen.findByRole('dialog', { name: 'Members of Site Operations' })).toBeInTheDocument();
});
```

`e2e/members.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('an owner invites someone and revokes the invitation', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Members of Site Operations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Members of Site Operations' });
  await dialog.getByLabel('Email', { exact: true }).fill('new.person@example.com');
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText('Invitation sent to new.person@example.com')).toBeVisible();
  await dialog.getByRole('button', { name: 'Revoke invitation to new.person@example.com' }).click();
  await expect(page.getByText('Invitation revoked')).toBeVisible();
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/features` → FAIL.

- [ ] **Step 3: Implement** everything in Interfaces, and register the dialog in `DialogHost`.

- [ ] **Step 4: Run** `npm run check && npm run test:e2e` → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the workspace members dialog"
```

---

### Task 7: Viewer restrictions

**Spec:** §5.9.

**Files:**
- Modify: `src/features/home/WelcomeBanner.tsx`, `src/features/home/RecentProjects.tsx`, `src/components/layout/ProjectSwitcher.tsx`
- Test: `src/features/workspaces/viewer-restrictions.test.tsx`

**Interfaces:**
- Consumes: `canEdit` (Task 6); `useCurrentContext` (Phase 1).
- Pins:
  - With `!canEdit(currentWorkspace)`, the three banner buttons:
    - get `aria-disabled="true"` and `cursor-not-allowed opacity-60`;
    - return early from `onClick`;
    - show the shadcn `Tooltip` "Viewers can't make changes in this workspace" (the same pattern as the disabled sidebar items).
  - Every banner button is always rendered inside `Tooltip` / `TooltipTrigger asChild`, and only the `TooltipContent` depends on the role. The button therefore never remounts when the role arrives after the first render.
  - `RecentProjects` leaves out `CreateProjectCard` for viewers. With no projects, it shows `EmptyState` (`FolderKanban`, size `md`) with "No projects yet" and "Projects in this workspace will appear here.".
  - `ProjectSwitcher` leaves out the separator and the "Create new project" item for viewers.

- [ ] **Step 1: Write the failing tests** — `src/features/workspaces/viewer-restrictions.test.tsx`

```tsx
import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import type { Role } from '@/data/types';
import { ProjectSwitcher } from '@/components/layout/ProjectSwitcher';
import { RecentProjects } from '@/features/home/RecentProjects';
import { WelcomeBanner } from '@/features/home/WelcomeBanner';
import { createTestDataLayer } from '@/test/fakes';
import { renderWithProviders } from '@/test/render';

function inTeam(ui: ReactElement, teamRole: Role, options: { noProjects?: boolean } = {}) {
  const dataLayer = createTestDataLayer({ teamRole });
  const team = dataLayer.store.read().workspaces.find((w) => w.kind === 'team')!;
  if (options.noProjects) dataLayer.store.write((db) => { db.projects = db.projects.filter((p) => p.workspaceId !== team.id); });
  return renderWithProviders(ui, { route: `/w/${team.id}/projects`, path: '/w/:workspaceId/projects', dataLayer });
}

describe('viewer restrictions', () => {
  it('disables the banner actions for viewers and says why', async () => {
    const { user } = inTeam(<WelcomeBanner />, 'viewer');
    await waitFor(() => expect(screen.getByRole('button', { name: 'New project' })).toHaveAttribute('aria-disabled', 'true'));
    for (const name of ['New schedule', 'Import schedule']) expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    const newProject = screen.getByRole('button', { name: 'New project' }); // query again: the role arrives after the first render
    await user.hover(newProject); // hover before clicking: a click closes Radix tooltips
    expect(await screen.findByRole('tooltip')).toHaveTextContent("Viewers can't make changes in this workspace");
    await user.click(newProject);
    expect(screen.getByTestId('dialog')).toHaveTextContent('none');
  });

  it('keeps the banner actions for editors', async () => {
    inTeam(<WelcomeBanner />, 'editor');
    const newProject = await screen.findByRole('button', { name: 'New project' });
    await screen.findByText(/Hello/);
    expect(newProject).not.toHaveAttribute('aria-disabled');
  });

  it('hides project creation from viewers in Recent projects', async () => {
    inTeam(<RecentProjects />, 'viewer', { noProjects: true });
    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByText('Projects in this workspace will appear here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create new project' })).not.toBeInTheDocument();
  });

  it('hides "Create new project" in the project switcher for viewers', async () => {
    const { user } = inTeam(<ProjectSwitcher />, 'viewer');
    await user.click(await screen.findByRole('button', { name: 'Switch project' }));
    await screen.findByPlaceholderText('Search projects…');
    expect(screen.queryByRole('option', { name: /Create new project/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail** — `npx vitest run src/features/workspaces/viewer-restrictions.test.tsx` → FAIL.

- [ ] **Step 3: Implement** the pins.

- [ ] **Step 4: Run** `npm run check` → all checks pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: limit create actions for workspace viewers"
```

---

### Task 8: Missing names and cover photos

**Spec:** §5.6 ("Missing names"), §8.3.

**Files:**
- Create: `src/lib/image.ts`, `src/hooks/useProfile.ts`, `src/features/profile/CompleteProfileDialog.tsx`
- Modify: `src/components/layout/AppShell.tsx` (renders `CompleteProfileDialog`), `src/features/home/WelcomeBanner.tsx` (greeting fallback), `src/hooks/useProjects.ts` (`useCreateProject` prepares the cover)
- Test: `src/lib/image.test.ts`, `src/features/profile/CompleteProfileDialog.test.tsx`, `src/hooks/data-hooks.test.tsx` (one case added)

**Interfaces:**
- Consumes: `FormDialog`, `personNameSchema` (Task 5), `useCurrentUser` (Phase 1).
- Produces:
  ```ts
  // src/lib/image.ts
  export const COVER_MAX_EDGE = 1600;
  export const COVER_QUALITY = 0.85;
  export function fitWithin(width: number, height: number, max: number): { width: number; height: number }; // long edge ≤ max, rounded, at least 1; never upscales
  export function prepareCoverImage(file: File): Promise<File>;
  // src/hooks/useProfile.ts
  export function useUpdateProfile(): UseMutationResult<User, unknown, { firstName: string; lastName: string }>; // invalidates ['me'] and ['members']
  // src/features/profile/CompleteProfileDialog.tsx
  export function CompleteProfileDialog(): ReactElement | null;
  ```
- `prepareCoverImage` (the algorithm the signature leaves open):
  1. When `typeof createImageBitmap !== 'function'`, return `file`.
  2. Otherwise draw the bitmap on a canvas sized by `fitWithin(bitmap.width, bitmap.height, COVER_MAX_EDGE)`, over a `#ffffff` fill (canvas background, not UI styling).
  3. Encode with `canvas.toBlob(cb, 'image/jpeg', COVER_QUALITY)`.
  4. Return `new File([blob], <name without extension> + '.jpg', { type: 'image/jpeg' })`, or the original when encoding fails or the result isn't smaller.
- `useCreateProject` passes `coverImage ? await prepareCoverImage(coverImage) : null` to the repository.
- `CompleteProfileDialog` (P2 spec §5.6 copy):
  - It is rendered by `AppShell` inside `DialogsProvider`'s tree, but not through it.
  - It is open while `useCurrentUser().data?.firstName === ''` and a local `dismissed` state is false. That's derived state, not an effect.
  - It's a `FormDialog` (width `sm`): submit "Save" / "Saving…", fields "First name" and "Last name".
  - Success → `toast.success('Name saved')`. Cancel sets `dismissed`.
- `WelcomeBanner` greets "Hello" when the first name is empty.

- [ ] **Step 1: Write the failing tests**

`src/lib/image.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fitWithin, prepareCoverImage } from '@/lib/image';

describe('cover images', () => {
  it.each([
    [4000, 3000, { width: 1600, height: 1200 }],
    [3000, 4000, { width: 1200, height: 1600 }],
    [800, 600, { width: 800, height: 600 }],
    [4000, 1, { width: 1600, height: 1 }],
  ])('fits %i×%i within 1600 px', (w, h, expected) => {
    expect(fitWithin(w, h, 1600)).toEqual(expected);
  });

  it('keeps the original file when the browser cannot re-encode images', async () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    expect(await prepareCoverImage(file)).toBe(file);
  });
});
```

`src/hooks/data-hooks.test.tsx` — add (with `vi.mock('@/lib/image', () => ({ prepareCoverImage: vi.fn(async () => new File(['small'], 'cover.jpg', { type: 'image/jpeg' })) }))` at the top of the file):

```tsx
it('useCreateProject stores the prepared cover image', async () => {
  const dl = createTestDataLayer();
  const workspaceId = dl.store.read().workspaces[0]!.id;
  const create = vi.spyOn(dl.repository, 'createProject');
  const { result } = renderHook(() => useCreateProject(), { wrapper: createQueryWrapper(dl) });
  await act(() => result.current.mutateAsync(makeNewProjectInput(workspaceId, { code: '008', coverImage: new File(['big'], 'photo.png', { type: 'image/png' }) })));
  expect(create.mock.calls[0]![0].coverImage).toMatchObject({ name: 'cover.jpg', type: 'image/jpeg' });
});
```

`src/features/profile/CompleteProfileDialog.test.tsx`:

```tsx
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTestDataLayer } from '@/test/fakes';
import { renderApp } from '@/test/render';

function withoutName() {
  const dataLayer = createTestDataLayer();
  dataLayer.store.write((db) => {
    const me = db.users.find((u) => u.id === db.currentUserId)!;
    me.firstName = '';
    me.lastName = '';
  });
  return dataLayer;
}

describe('CompleteProfileDialog', () => {
  it('asks for a missing name and saves it', async () => {
    const { user } = renderApp('/home', { dataLayer: withoutName() });
    const dialog = await screen.findByRole('dialog', { name: 'Add your name' });
    expect(screen.getByRole('heading', { level: 1, name: 'Hello', hidden: true })).toBeInTheDocument(); // the open dialog hides the page from role queries
    expect(within(dialog).getByText('Your name is shown to people in your workspaces.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('First name'), 'Ada');
    await user.type(within(dialog).getByLabelText('Last name'), 'Lovelace');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add your name' })).not.toBeInTheDocument());
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Ada' })).toBeInTheDocument();
  });

  it('closes on Cancel', async () => {
    const { user } = renderApp('/home', { dataLayer: withoutName() });
    const dialog = await screen.findByRole('dialog', { name: 'Add your name' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add your name' })).not.toBeInTheDocument());
  });

  it('stays away when the name is known', async () => {
    renderApp('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Add your name' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/lib/image.test.ts src/features/profile src/hooks/data-hooks.test.tsx` → FAIL.

- [ ] **Step 3: Implement** everything in Interfaces.

- [ ] **Step 4: Run** `npm run check && npm run test:e2e` → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: ask for missing names and shrink cover photos before upload"
```

---

### Task 9: Core schema, grants and helpers

**Spec:** §6.5, §6.6 (helpers, trigger functions), §6.7; Phase 1 spec §9 (schema draft).

**Files:**
- Create: `supabase/migrations/<ts>_core_schema.sql`, `supabase/migrations/<ts>_app_helpers.sql`, `supabase/tests/_helpers.psql`, `supabase/tests/01_schema.test.sql`, `supabase/tests/02_privileges.test.sql`, `src/data/supabase/database.types.ts` (generated)
- Modify: `package.json` (`db:types`, `test:db` from P2 spec §4.4), `eslint.config.js` and `.prettierignore` (ignore `src/data/supabase/database.types.ts`)

**Interfaces:**
- Tables: the Phase 1 spec §9 draft with the P2 spec §6.5 changes, exactly:

| Table | Differences from the §9 draft |
|---|---|
| `profiles` | `first_name`, `last_name` `not null default ''`, each `check (char_length(…) <= 60)` |
| `workspaces` | `owner_id` → `created_by uuid references public.profiles (id) on delete set null` |
| `workspace_members` | `role text not null check (role in ('owner', 'editor', 'viewer'))` (no default); `joined_at timestamptz not null default now()`; index `workspace_members_user_idx (user_id)` |
| `workspace_invitations` | new: `id uuid primary key default gen_random_uuid()`, `workspace_id uuid not null references public.workspaces (id) on delete cascade`, `email text not null check (email = lower(email))`, `role text not null check (role in ('owner', 'editor', 'viewer'))`, `invited_by uuid references public.profiles (id) on delete set null`, `created_at timestamptz not null default now()`, `accepted_at timestamptz`, `revoked_at timestamptz`; unique index `workspace_invitations_pending_uq (workspace_id, email) where accepted_at is null and revoked_at is null`; index `workspace_invitations_pending_email_idx (email) where accepted_at is null and revoked_at is null` |
| `projects` | `cover_image_url` → `cover_image_path text`; index `projects_workspace_updated_idx (workspace_id, updated_at desc)` (keeps `projects_workspace_code_uq`) |
| `schedules` | index `schedules_project_idx (project_id)` |
| `schedule_shares` | index `schedule_shares_with_idx (shared_with, shared_at desc)` |
| `tasks` | index `tasks_assignee_pending_idx (assignee_id) where not done` |

  The draft's `public.touch_project` and views are not created here. Trigger functions move to `app` (below); views come in Task 11.
- End of `core_schema`: `alter table … enable row level security` on all nine tables, then the grants:
  1. Revoke all on all tables, sequences and functions in `public` from `anon` and `authenticated`, and `execute` on functions from `public`.
  2. Run the matching `alter default privileges in schema public revoke … from anon, authenticated` (tables, sequences, functions). These per-schema defaults remove Supabase's API-role grants for later objects, but they cannot remove PostgreSQL's global `EXECUTE` for `PUBLIC` on new functions. So every migration that creates a function revokes `execute` on it from `public, anon, authenticated` explicitly and then grants what it needs; `02_privileges` checks the result. Do **not** add a global `alter default privileges revoke execute on functions from public` (without `in schema`): it also strips `EXECUTE` from extensions created later, and pgTAP's own functions then fail with "permission denied" (reproduced on PostgreSQL 16 while this plan was checked).
  3. `grant all on all tables in schema public to service_role`.
  4. `grant select` on all nine tables to `authenticated`; `grant insert` on `projects`, `schedules`, `schedule_shares`; `grant delete` on `projects`, `schedules`, `schedule_shares`.
  5. Column `update` grants:

     | Table | Updatable columns |
     |---|---|
     | `profiles` | `first_name`, `last_name`, `avatar_url` |
     | `workspaces` | `name` |
     | `projects` | `code`, `name`, `description`, `cover_image_path`, `status_date`, `project_type`, `start_date`, `planned_finish_date`, `client_name`, `client_contact_name`, `client_contact_email`, `location_address`, `location_city`, `location_country` |
     | `schedules` | `name`, `status_date` |
     | `tasks` | `done` |
- `app_helpers`:
  - Create schema `app`: `revoke all on schema app from public`; `grant usage on schema app to authenticated`.
  - `app.role_rank(p_role text) returns int` (immutable; owner 3, editor 2, viewer 1, else 0).
  - `app.my_workspace_ids`, `app.my_project_ids` and `app.has_role`, per P2 spec §6.6.
  - Trigger functions: `app.set_updated_at()` (sets `new.updated_at := now()` when it is not distinct from `old.updated_at`), `app.fill_schedule_status_date()` and `app.touch_project()`. All definer.
  - Triggers: `projects_set_updated_at` and `schedules_set_updated_at` (before update), `schedules_fill_status_date` (before insert), `schedules_touch_project` (after insert).
  - Privileges: `revoke execute on all functions in schema app from public` at the end of this migration (it covers only the functions that exist now; later migrations revoke their own, see step 2 above); grant `execute` on `app.my_workspace_ids(text)` and `app.my_project_ids(text)` to `authenticated`.
- `supabase/tests/_helpers.psql` (included by every test file with `\ir _helpers.psql`; everything is rolled back with the test):

```sql
create extension if not exists pgtap with schema extensions;
create schema if not exists tests;

create or replace function tests.create_user(p_email text, p_confirmed boolean default true, p_meta jsonb default '{}')
returns uuid language sql security definer set search_path = '' as $$
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
  values (gen_random_uuid(), lower(p_email), case when p_confirmed then now() end, p_meta)
  returning id $$;

create or replace function tests.create_profile(p_email text)  -- unconfirmed user + hand-made profile (works before and after Task 10)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid := tests.create_user(p_email, false);
begin
  insert into public.profiles (id, first_name, last_name, email) values (v_id, 'Test', 'User', lower(p_email));
  return v_id;
end $$;

create or replace function tests.user_id(p_email text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from auth.users where email = lower(p_email) $$;
create or replace function tests.workspace_id(p_name text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.workspaces where name = p_name and kind = 'team' $$;
create or replace function tests.personal_workspace(p_user_id uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.workspaces where created_by = p_user_id and kind = 'personal' $$;
create or replace function tests.project_id(p_code text) returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.projects where code = p_code $$;

create or replace function tests.team_workspace(p_name text, p_owner uuid) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.workspaces (name, kind, created_by) values (p_name, 'team', p_owner) returning id into v_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (v_id, p_owner, 'owner');
  return v_id;
end $$;
create or replace function tests.add_member(p_workspace_id uuid, p_user_id uuid, p_role text) returns void language sql security definer set search_path = '' as $$
  insert into public.workspace_members (workspace_id, user_id, role) values (p_workspace_id, p_user_id, p_role) $$;
create or replace function tests.add_project(p_workspace_id uuid, p_code text) returns uuid language sql security definer set search_path = '' as $$
  insert into public.projects (workspace_id, code, name) values (p_workspace_id, p_code, 'Project ' || p_code) returning id $$;

create or replace function tests.authenticate_as(p_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
end $$;
create or replace function tests.authenticate_as_anon() returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end $$;
create or replace function tests.clear_authentication() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;
```

If the installed CLI's `supabase test db` can't resolve `\ir`, define the same functions in `supabase/seed.sql` (local only) and record that in the verification notes.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/01_schema.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(19);

select has_table('public', t, format('table public.%s exists', t))
  from unnest(array['profiles', 'subscriptions', 'workspaces', 'workspace_members', 'workspace_invitations',
                    'projects', 'schedules', 'schedule_shares', 'tasks']) as t;

select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0, 'RLS is enabled on every public table');

do $$
declare v_owner uuid := tests.create_profile('owner@test.dev'); v_ws uuid;
begin
  insert into public.workspaces (name, kind, created_by) values ('Crew', 'team', v_owner) returning id into v_ws;
  insert into public.projects (workspace_id, code, name, status_date, updated_at) values (v_ws, 'P1', 'Pier', '2026-10-12', '2026-01-01T00:00:00Z');
end $$;

select throws_ok($$ insert into public.workspace_members (workspace_id, user_id, role) values (tests.workspace_id('Crew'), tests.user_id('owner@test.dev'), 'member') $$,
  '23514', null, 'roles are owner, editor or viewer');
select throws_ok($$ insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'p1', 'Copy') $$,
  '23505', null, 'project codes are unique per workspace, ignoring case');
select throws_ok($$ insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'Ann@test.dev', 'editor') $$,
  '23514', null, 'invitation emails are stored lowercased');
insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'ann@test.dev', 'editor');
select throws_ok($$ insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'ann@test.dev', 'viewer') $$,
  '23505', null, 'one pending invitation per workspace and email');
update public.workspace_invitations set revoked_at = now() where email = 'ann@test.dev';
select lives_ok($$ insert into public.workspace_invitations (workspace_id, email, role) values (tests.workspace_id('Crew'), 'ann@test.dev', 'viewer') $$,
  'a revoked invitation does not block a new one');

update public.projects set name = 'Pier 2' where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), now(), 'an update without updated_at sets it to now');
update public.projects set updated_at = '2026-02-02T00:00:00Z' where code = 'P1';
select is((select updated_at from public.projects where code = 'P1'), '2026-02-02T00:00:00Z'::timestamptz, 'an explicit updated_at is kept');
insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'Baseline', 'blank');
select is((select status_date from public.schedules where name = 'Baseline'), '2026-10-12'::date, 'a new schedule copies the project status date');
select is((select updated_at from public.projects where code = 'P1'), now(), 'a new schedule touches its project');

select * from finish();
rollback;
```

`supabase/tests/02_privileges.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(15);

select is_empty($$ select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public' $$,
  'anon has no privileges on public tables');
select table_privs_are('public', 'profiles', 'authenticated', array['SELECT'], 'profiles: select only at table level');
select column_privs_are('public', 'profiles', 'first_name', 'authenticated', array['SELECT', 'UPDATE'], 'profiles.first_name is editable');
select column_privs_are('public', 'profiles', 'email', 'authenticated', array['SELECT'], 'profiles.email is read-only');
select column_privs_are('public', 'workspaces', 'name', 'authenticated', array['SELECT', 'UPDATE'], 'workspaces.name is editable');
select column_privs_are('public', 'workspaces', 'kind', 'authenticated', array['SELECT'], 'workspaces.kind is read-only');
select table_privs_are('public', 'workspace_members', 'authenticated', array['SELECT'], 'memberships change only through functions');
select table_privs_are('public', 'workspace_invitations', 'authenticated', array['SELECT'], 'invitations change only through the Edge Function');
select table_privs_are('public', 'projects', 'authenticated', array['DELETE', 'INSERT', 'SELECT'], 'projects: select, insert, delete; columns for update');
select column_privs_are('public', 'projects', 'updated_at', 'authenticated', array['INSERT', 'SELECT'], 'projects.updated_at is never updated by users');
select column_privs_are('public', 'tasks', 'done', 'authenticated', array['SELECT', 'UPDATE'], 'tasks.done is editable');
select column_privs_are('public', 'tasks', 'title', 'authenticated', array['SELECT'], 'tasks.title is read-only');
select function_privs_are('app', 'my_workspace_ids', array['text'], 'authenticated', array['EXECUTE'], 'policies can call my_workspace_ids');
select function_privs_are('app', 'my_workspace_ids', array['text'], 'anon', array[]::text[], 'anon cannot');
select function_privs_are('app', 'has_role', array['uuid', 'text'], 'authenticated', array[]::text[], 'has_role is internal');

select * from finish();
rollback;
```

- [ ] **Step 2: Run them to see them fail** — `npm run test:db` → FAIL (tables missing).

- [ ] **Step 3: Implement** both migrations (`npx supabase migration new core_schema`, then `app_helpers`), then run `npx supabase db reset`.

- [ ] **Step 4: Run** `npm run test:db` → `01` and `02` pass. Then `npm run db:types` → `database.types.ts` lists the nine tables.

- [ ] **Step 5: Run** `npm run check` → all checks pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: add the core database schema, grants and helpers"
```

---

### Task 10: Account bootstrap

**Spec:** §5.6, §6.6 (`bootstrap_account`, auth triggers), D12.

**Files:**
- Create: `supabase/migrations/<ts>_auth_bootstrap.sql`, `supabase/tests/03_bootstrap.test.sql`, `integration/bootstrap.itest.ts`
- Modify: `src/data/supabase/database.types.ts` (regenerated)

**Interfaces:**
- `app.bootstrap_account(p_user_id uuid, p_email text, p_meta jsonb) returns void` — definer, idempotent (returns at once when the profile exists). It runs P2 spec §5.6 steps 1–4:
  - Name rules: trimmed metadata `first_name` / `last_name`; else `given_name` / `family_name`; else `full_name` (then `name`) split at the first space (first word → first name, the rest → last name); else `''`. Each name is cut to 60 characters.
  - The trial ends at `now() + interval '336 hours'` (exact; no daylight-saving drift).
  - Accepting invitations: insert memberships `on conflict do nothing`, then set `accepted_at` on the pending invitations for `lower(p_email)`.
- `app.on_auth_user_created()` → trigger `on_auth_user_created after insert on auth.users`; it bootstraps only when `new.email_confirmed_at is not null`.
- `app.on_auth_user_confirmed()` → trigger `on_auth_user_confirmed after update of email_confirmed_at on auth.users … when (old.email_confirmed_at is null and new.email_confirmed_at is not null)`.
- `app.sync_profile_email()` → trigger `on_auth_user_email_changed after update of email on auth.users … when (old.email is distinct from new.email)`; it sets `profiles.email = lower(new.email)`.
- All four functions are `security definer set search_path = ''` (the triggers run as Supabase Auth's database role).
- End of the migration: `revoke execute on function app.bootstrap_account(uuid, text, jsonb), app.on_auth_user_created(), app.on_auth_user_confirmed(), app.sync_profile_email() from public, anon, authenticated;` (Task 9 step 2: new functions are executable by `PUBLIC` until revoked; triggers still fire, because a trigger never checks `EXECUTE` for the role that fires it).

- [ ] **Step 1: Write the failing tests**

`supabase/tests/03_bootstrap.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(10);

select tests.create_user('ada@test.dev', true, '{"first_name":"Ada","last_name":"Lovelace"}') as ada \gset
select results_eq($$ select first_name, last_name, email from public.profiles where id = tests.user_id('ada@test.dev') $$,
  $$ values ('Ada'::text, 'Lovelace'::text, 'ada@test.dev'::text) $$, 'a confirmed account gets a profile from its metadata');
select results_eq($$ select w.name, w.kind, m.role from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
                     where m.user_id = tests.user_id('ada@test.dev') $$,
  $$ values ('My workspace'::text, 'personal'::text, 'owner'::text) $$, 'and a personal workspace it owns');
select results_eq($$ select plan, trial_ends_at = now() + interval '336 hours' from public.subscriptions where user_id = tests.user_id('ada@test.dev') $$,
  $$ values ('trial'::text, true) $$, 'and a 14-day trial');

select tests.create_user('pending@test.dev', false) as pending \gset
select is_empty($$ select 1 from public.profiles where id = tests.user_id('pending@test.dev') $$, 'an unconfirmed account gets nothing yet');

do $$
declare v_crew uuid := tests.team_workspace('Crew', tests.user_id('ada@test.dev'));
        v_old uuid := tests.team_workspace('Old crew', tests.user_id('ada@test.dev'));
begin
  insert into public.workspace_invitations (workspace_id, email, role) values (v_crew, 'pending@test.dev', 'editor'), (v_crew, 'other@test.dev', 'viewer');
  insert into public.workspace_invitations (workspace_id, email, role, revoked_at) values (v_old, 'pending@test.dev', 'owner', now());
end $$;
update auth.users set email_confirmed_at = now() where id = tests.user_id('pending@test.dev');

select results_eq($$ select w.name, m.role from public.workspace_members m join public.workspaces w on w.id = m.workspace_id
                     where m.user_id = tests.user_id('pending@test.dev') order by w.name $$,
  $$ values ('Crew'::text, 'editor'::text), ('My workspace'::text, 'owner'::text) $$, 'confirming accepts pending invitations, never revoked ones');
select ok((select accepted_at is not null from public.workspace_invitations where email = 'pending@test.dev' and revoked_at is null), 'the invitation is marked accepted');
select ok((select accepted_at is null from public.workspace_invitations where email = 'other@test.dev'), 'other emails'' invitations stay pending');

select tests.create_user('g@test.dev', true, '{"given_name":"Grace","family_name":"Hopper"}') as g \gset
select tests.create_user('f@test.dev', true, '{"full_name":"Alan Mathison Turing"}') as f \gset
select tests.create_user('n@test.dev', true, '{"name":"Hedy"}') as n \gset
select tests.create_user('x@test.dev', true, '{}') as x \gset
select results_eq($$ select email, first_name, last_name from public.profiles where email in ('f@test.dev', 'g@test.dev', 'n@test.dev', 'x@test.dev') order by email $$,
  $$ values ('f@test.dev'::text, 'Alan'::text, 'Mathison Turing'::text), ('g@test.dev', 'Grace', 'Hopper'), ('n@test.dev', 'Hedy', ''), ('x@test.dev', '', '') $$,
  'names fall back to given and family names, then a split full name, then empty');

update auth.users set email_confirmed_at = null where id = tests.user_id('ada@test.dev');
update auth.users set email_confirmed_at = now() where id = tests.user_id('ada@test.dev');
select is((select count(*)::int from public.workspaces where created_by = tests.user_id('ada@test.dev') and kind = 'personal'), 1, 'bootstrap runs once per account');

update auth.users set email = 'Ada.New@test.dev' where id = tests.user_id('ada@test.dev');
select is((select p.email from public.profiles p join auth.users u on u.id = p.id where u.email = 'Ada.New@test.dev'), 'ada.new@test.dev', 'the profile email follows the auth email, lowercased');

select * from finish();
rollback;
```

`integration/bootstrap.itest.ts` — the same trigger path, run through Supabase Auth's own role:

```ts
import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { readLocalStack } from './local-stack';
import { tokenHashFrom, waitForEmail } from './mailbox';

const stack = readLocalStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(stack.apiUrl, stack.secretKey, options);
const unique = (tag: string) => `${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@example.com`;

it('bootstraps an account created as confirmed through the admin API', async () => {
  const email = unique('boot');
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'letters12345', email_confirm: true, user_metadata: { first_name: 'Ada', last_name: 'Lovelace' } });
  expect(error).toBeNull();
  const { data: profile } = await admin.from('profiles').select('first_name, last_name, email').eq('id', data.user!.id).single();
  expect(profile).toEqual({ first_name: 'Ada', last_name: 'Lovelace', email });
});

it('bootstraps an invited account only when the invitation is accepted', async () => {
  const email = unique('invited');
  const after = new Date();
  const { data } = await admin.auth.admin.inviteUserByEmail(email);
  expect((await admin.from('profiles').select('id').eq('id', data.user!.id)).data).toEqual([]);
  const mail = await waitForEmail(stack.mailUrl, email, { after });
  await createClient(stack.apiUrl, stack.publishableKey, options).auth.verifyOtp({ token_hash: tokenHashFrom(mail.html), type: 'invite' });
  expect((await admin.from('profiles').select('id').eq('id', data.user!.id)).data).toHaveLength(1);
});
```

- [ ] **Step 2: Run them to see them fail** — `npm run test:db` → `03` FAILS; `npm run test:integration` → `bootstrap.itest.ts` FAILS.

- [ ] **Step 3: Implement** the migration, then run `npx supabase db reset && npm run db:types`.

- [ ] **Step 4: Run** `npm run test:db && npm run test:integration && npm run check` → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: bootstrap accounts when they are confirmed"
```

---

### Task 11: RLS, views and RPCs

**Spec:** §6.5 (views), §6.6 (public RPCs, error rules), §7.1, §7.2.

**Files:**
- Create: `supabase/migrations/<ts>_rls.sql`, `supabase/migrations/<ts>_views_and_rpc.sql`, `supabase/tests/04_rls.test.sql`, `supabase/tests/05_rpc.test.sql`
- Modify: `supabase/tests/02_privileges.test.sql` (6 assertions added), `src/data/supabase/database.types.ts`

**Interfaces:**
- Policies — all `to authenticated`; `me` means `(select auth.uid())`, `ws(r)` means `(select app.my_workspace_ids('r'))`, `pr(r)` means `(select app.my_project_ids('r'))`:

| Table | Policy (command) | Using / with check |
|---|---|---|
| `profiles` | `profiles_select` (select) | `id = me or id in (select m.user_id from public.workspace_members m where m.workspace_id in ws('viewer')) or id in (select s.shared_by from public.schedule_shares s where s.shared_with = me)` |
| | `profiles_update_self` (update) | using and check `id = me` |
| `subscriptions` | `subscriptions_select_self` (select) | `user_id = me` |
| `workspaces` | `workspaces_select` (select) | `id in ws('viewer')` |
| | `workspaces_update_owner` (update) | using and check `id in ws('owner')` |
| `workspace_members` | `members_select` (select) | `workspace_id in ws('viewer')` |
| `workspace_invitations` | `invitations_select_owner` (select) | `workspace_id in ws('owner')` |
| `projects` | `projects_select` (select) | `workspace_id in ws('viewer') or id in (select s.project_id from public.schedules s join public.schedule_shares sh on sh.schedule_id = s.id where sh.shared_with = me)` |
| | `projects_insert` / `projects_update` | check / using and check `workspace_id in ws('editor')` |
| | `projects_delete` | using `workspace_id in ws('owner')` |
| `schedules` | `schedules_select` | `project_id in pr('viewer') or id in (select sh.schedule_id from public.schedule_shares sh where sh.shared_with = me)` |
| | `schedules_insert` / `schedules_update` | `project_id in pr('editor')` |
| | `schedules_delete` | `project_id in pr('owner')` |
| `schedule_shares` | `shares_select` | `shared_with = me or shared_by = me` |
| | `shares_insert` | check `shared_by = me and schedule_id in (select s.id from public.schedules s where s.project_id in pr('editor'))` |
| | `shares_delete` | using `shared_by = me` |
| `tasks` | `tasks_select` / `tasks_update` | `assignee_id = me` (update: using and check) |

- Views (`security_invoker = true`; then `revoke all on … from anon, authenticated` and `grant select on … to authenticated`):
  - `project_summaries`: the §9 draft.
  - `workspace_summaries`: the draft plus `my_role` = `(select m.role from public.workspace_members m where m.workspace_id = w.id and m.user_id = (select auth.uid()))`.
  - `shared_with_me`: the draft, with `(select auth.uid())`.
- RPCs (all `security definer set search_path = ''` except `is_project_code_available`; end the migration with `revoke all on function … from public, anon, authenticated` and `grant execute on function … to authenticated` for all four, per Task 9 step 2):
  - `public.create_team_workspace(p_name text) returns public.workspace_summaries`:
    - an empty `auth.uid()` raises `insufficient_privilege`;
    - a trimmed name outside 2–40 characters raises `check_violation` / `hint 'app'` / `'Use 2–40 characters'`.
  - `public.is_project_code_available(p_workspace_id uuid, p_code text) returns boolean` (invoker).
  - `public.update_member_role(p_workspace_id uuid, p_user_id uuid, p_role text) returns void` and `public.remove_member(p_workspace_id uuid, p_user_id uuid) returns void`:
    1. A caller who isn't an owner raises `insufficient_privilege` with 'Only workspace owners can change members.'.
    2. `select … from public.workspace_members where workspace_id = p_workspace_id for update`.
    3. A target who isn't a member raises `check_violation` / `hint 'app'` / 'This person is no longer a member.'.
    4. When no owner would remain, raise `check_violation` / `hint 'app'` / 'A workspace needs at least one owner.'.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/04_rls.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(35);

do $$
declare
  v_olive uuid := tests.create_user('olive@test.dev', true, '{"first_name":"Olive"}');
  v_ed uuid := tests.create_user('ed@test.dev', true, '{"first_name":"Ed"}');
  v_vi uuid := tests.create_user('vi@test.dev', true, '{"first_name":"Vi"}');
  v_out uuid := tests.create_user('out@test.dev', true, '{"first_name":"Out"}');
  v_sam uuid := tests.create_user('sam@test.dev', true, '{"first_name":"Sam"}');
  v_crew uuid := tests.team_workspace('Crew', v_olive);
  v_other uuid := tests.team_workspace('Other', v_sam);
  v_shared uuid;
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.add_project(v_crew, 'P1');
  perform tests.add_project(v_crew, 'P2');
  update public.projects set updated_at = '2026-01-01T00:00:00Z' where code = 'P2';  -- so the editor's touch below is visible
  perform tests.add_project(v_other, 'Q2');
  insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'S1', 'blank');
  insert into public.schedules (project_id, name, source) values (tests.add_project(v_other, 'Q1'), 'Shared one', 'blank') returning id into v_shared;
  insert into public.schedule_shares (schedule_id, shared_by, shared_with) values (v_shared, v_sam, v_out);
  insert into public.tasks (assignee_id, title) values (v_ed, 'Ed''s task');
  insert into public.workspace_invitations (workspace_id, email, role, invited_by) values (v_crew, 'new@test.dev', 'editor', v_olive);
end $$;

-- an outsider
select tests.authenticate_as(tests.user_id('out@test.dev'));
select is_empty($$ select 1 from public.workspaces where name = 'Crew' $$, 'an outsider cannot see the workspace');
select is_empty($$ select 1 from public.workspace_members where workspace_id = tests.workspace_id('Crew') $$, '… its members');
select is_empty($$ select 1 from public.projects where code = 'P1' $$, '… its projects');
select is_empty($$ select 1 from public.schedules where name = 'S1' $$, '… or its schedules');
select results_eq($$ select code from public.projects order by code $$, $$ values ('Q1'::text) $$, 'a share reveals only the shared schedule''s project');
select results_eq($$ select schedule_name, project_name, shared_by_first_name from public.shared_with_me $$,
  $$ values ('Shared one'::text, 'Project Q1'::text, 'Sam'::text) $$, 'shared_with_me names the schedule, project and sharer');
select results_eq($$ select first_name from public.profiles order by first_name $$, $$ values ('Out'::text), ('Sam'::text) $$, 'profiles: self and the sharer only');
select results_eq($$ select count(*)::int from public.subscriptions $$, $$ values (1) $$, 'subscriptions: their own only');
select is_empty($$ select 1 from public.workspace_summaries where name = 'Crew' $$, 'the summary views filter too: no workspace summary');
select is_empty($$ select 1 from public.project_summaries where code = 'P1' $$, '… and no project summary');

-- a viewer
select tests.authenticate_as(tests.user_id('vi@test.dev'));
select results_eq($$ select name, my_role, project_count from public.workspace_summaries where name = 'Crew' $$,
  $$ values ('Crew'::text, 'viewer'::text, 2) $$, 'a viewer sees the workspace with their role');
select isnt_empty($$ select 1 from public.schedules where name = 'S1' $$, 'a viewer reads schedules');
select throws_ok($$ insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'V1', 'Nope') $$, '42501', null, 'a viewer cannot add projects');
select throws_ok($$ insert into public.schedules (project_id, name, source) values (tests.project_id('P1'), 'Nope', 'blank') $$, '42501', null, 'a viewer cannot add schedules');
with u as (update public.projects set name = 'Renamed' where code = 'P1' returning 1) select is(count(*)::int, 0, 'a viewer cannot rename projects') from u;
select is_empty($$ select 1 from public.workspace_invitations $$, 'a viewer cannot see invitations');
select is_empty($$ select 1 from public.tasks $$, 'a viewer sees only their own tasks');

-- an editor
select tests.authenticate_as(tests.user_id('ed@test.dev'));
select lives_ok($$ insert into public.projects (workspace_id, code, name) values (tests.workspace_id('Crew'), 'E1', 'Editor project') $$, 'an editor adds projects');
select lives_ok($$ insert into public.schedules (project_id, name, source) values (tests.project_id('P2'), 'By editor', 'blank') $$, 'an editor adds schedules');
select is((select updated_at from public.projects where code = 'P2'), now(), 'the editor''s schedule touches the project (touch_project must be a definer)');
with u as (update public.projects set name = 'Pier' where code = 'P1' returning 1) select is(count(*)::int, 1, 'an editor renames projects') from u;
with d as (delete from public.projects where code = 'E1' returning 1) select is(count(*)::int, 0, 'only owners delete projects') from d;
with u as (update public.workspaces set name = 'Ed crew' where name = 'Crew' returning 1) select is(count(*)::int, 0, 'only owners rename the workspace') from u;
select throws_ok($$ insert into public.workspace_members (workspace_id, user_id, role) values (tests.workspace_id('Crew'), tests.user_id('out@test.dev'), 'owner') $$, '42501', null, 'memberships are never inserted directly');
select throws_ok($$ update public.workspace_members set role = 'owner' where user_id = tests.user_id('ed@test.dev') $$, '42501', null, 'an editor cannot make themselves owner');
with u as (update public.tasks set done = true returning 1) select is(count(*)::int, 1, 'an editor completes their own task') from u;
select throws_ok($$ update public.tasks set title = 'Changed' $$, '42501', null, 'only done is editable on tasks');
with u as (update public.profiles set first_name = 'Edward' where id = tests.user_id('ed@test.dev') returning 1) select is(count(*)::int, 1, 'people rename themselves') from u;
select throws_ok($$ update public.profiles set email = 'x@test.dev' where id = tests.user_id('ed@test.dev') $$, '42501', null, 'the profile email is read-only');
with u as (update public.profiles set first_name = 'Hacked' where id = tests.user_id('olive@test.dev') returning 1) select is(count(*)::int, 0, 'nobody renames someone else') from u;

-- an owner
select tests.authenticate_as(tests.user_id('olive@test.dev'));
select results_eq($$ select email from public.workspace_invitations $$, $$ values ('new@test.dev'::text) $$, 'owners see invitations');
with d as (delete from public.projects where code = 'E1' returning 1) select is(count(*)::int, 1, 'owners delete projects') from d;
with u as (update public.workspaces set name = 'Crew Two' where name = 'Crew' returning 1) select is(count(*)::int, 1, 'owners rename the workspace') from u;

-- anonymous
select tests.authenticate_as_anon();
select throws_ok($$ select 1 from public.projects $$, '42501', null, 'anon cannot read app tables');
select throws_ok($$ select 1 from public.workspace_summaries $$, '42501', null, 'anon cannot read app views');

select tests.clear_authentication();
select * from finish();
rollback;
```

`supabase/tests/05_rpc.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(11);

do $$
declare v_olive uuid := tests.create_user('olive@test.dev'); v_ed uuid := tests.create_user('ed@test.dev');
        v_vi uuid := tests.create_user('vi@test.dev'); v_crew uuid := tests.team_workspace('Crew', v_olive);
begin
  perform tests.add_member(v_crew, v_ed, 'editor');
  perform tests.add_member(v_crew, v_vi, 'viewer');
  perform tests.add_project(v_crew, 'PX1');
end $$;

select tests.authenticate_as(tests.user_id('ed@test.dev'));
select results_eq($$ select name, kind, my_role, project_count from public.create_team_workspace('  Field crew ') $$,
  $$ values ('Field crew'::text, 'team'::text, 'owner'::text, 0) $$, 'anyone creates a team workspace and owns it');
select throws_ok($$ select public.create_team_workspace('x') $$, '23514', 'Use 2–40 characters', 'workspace names need 2–40 characters');
select is(public.is_project_code_available(tests.workspace_id('Crew'), ' px1 '), false, 'codes compare trimmed and case-insensitively');
select is(public.is_project_code_available(tests.workspace_id('Crew'), 'P_1'), true, 'an underscore is a literal character');
select throws_ok($$ select public.update_member_role(tests.workspace_id('Crew'), tests.user_id('vi@test.dev'), 'editor') $$, '42501', null, 'editors cannot change roles');

select tests.authenticate_as(tests.user_id('olive@test.dev'));
select lives_ok($$ select public.update_member_role(tests.workspace_id('Crew'), tests.user_id('vi@test.dev'), 'editor') $$, 'owners change roles');
select throws_ok($$ select public.update_member_role(tests.workspace_id('Crew'), tests.user_id('olive@test.dev'), 'editor') $$, '23514', 'A workspace needs at least one owner.', 'the last owner keeps the role');
select throws_ok($$ select public.remove_member(tests.workspace_id('Crew'), tests.user_id('olive@test.dev')) $$, '23514', 'A workspace needs at least one owner.', 'the last owner stays');
select lives_ok($$ select public.remove_member(tests.workspace_id('Crew'), tests.user_id('vi@test.dev')) $$, 'owners remove members');
select throws_ok($$ select public.remove_member(tests.workspace_id('Crew'), tests.user_id('vi@test.dev')) $$, '23514', 'This person is no longer a member.', 'removing twice says why');
select throws_ok($$ select public.remove_member(tests.personal_workspace(tests.user_id('olive@test.dev')), tests.user_id('olive@test.dev')) $$, '23514', 'A workspace needs at least one owner.', 'a personal workspace keeps its owner');

select tests.clear_authentication();
select * from finish();
rollback;
```

`supabase/tests/02_privileges.test.sql` — raise the plan to 21 and add the lines below. The last two pin every executable function by name, so a function that a later migration forgets to revoke (Task 9 step 2) fails here. Names are built from `pg_namespace` and `oidvectortypes`, so they don't depend on the `search_path`:

```sql
select table_privs_are('public', 'workspace_summaries', 'authenticated', array['SELECT'], 'views are readable by signed-in users');
select table_privs_are('public', 'workspace_summaries', 'anon', array[]::text[], 'anon cannot read the views');
select function_privs_are('public', 'create_team_workspace', array['text'], 'authenticated', array['EXECUTE'], 'signed-in users call the RPCs');
select function_privs_are('public', 'create_team_workspace', array['text'], 'anon', array[]::text[], 'anon cannot');
select is_empty($$
  select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon can execute no app function');
select set_eq($$
  select n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app') and has_function_privilege('authenticated', p.oid, 'execute') $$,
  $$ values ('app.my_project_ids(text)'), ('app.my_workspace_ids(text)'), ('public.create_team_workspace(text)'),
            ('public.is_project_code_available(uuid, text)'), ('public.remove_member(uuid, uuid)'),
            ('public.update_member_role(uuid, uuid, text)') $$,
  'signed-in users can execute exactly the four RPCs and the two RLS helpers');
```

If the list shows a function you didn't create (an extension installed into `public`), record it in the verification notes and stop: don't loosen the check without the owner.

- [ ] **Step 2: Run them to see them fail** — `npm run test:db` → `04` and `05` FAIL.

- [ ] **Step 3: Implement** both migrations, then run `npx supabase db reset && npm run db:types`.

- [ ] **Step 4: Run** `npm run test:db && npm run check` → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add row-level security, read views and member RPCs"
```

---

### Task 12: Storage buckets and policies

**Spec:** §7.3, D5.

**Files:**
- Create: `supabase/migrations/<ts>_storage.sql`, `supabase/tests/06_storage.test.sql`, `integration/storage.itest.ts`

**Interfaces:**
- Buckets: `project-covers` (private, `file_size_limit` 5 242 880, `allowed_mime_types` `{image/jpeg,image/png}`) and `schedule-imports` (private, 20 971 520, no type limit).
- Policies on `storage.objects`, `to authenticated`, per bucket:
  - `*_select`: `bucket_id = '<bucket>' and (storage.foldername(name))[1] in (select id::text from app.my_workspace_ids('viewer') as id)`.
  - `*_insert` (check) and `*_delete` (using): the same with `'editor'`.
  - No update policy.
- Policies are checked through the Storage API (`integration/storage.itest.ts`); pgTAP checks only the bucket settings.

- [ ] **Step 1: Write the failing tests**

`supabase/tests/06_storage.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(1);
select results_eq(
  $$ select id, public, file_size_limit, allowed_mime_types from storage.buckets where id in ('project-covers', 'schedule-imports') order by id $$,
  $$ values ('project-covers'::text, false, 5242880::bigint, array['image/jpeg', 'image/png']::text[]), ('schedule-imports', false, 20971520::bigint, null::text[]) $$,
  'two private buckets with their limits');
select * from finish();
rollback;
```

`integration/storage.itest.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack } from './local-stack';

const stack = readLocalStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(stack.apiUrl, stack.secretKey, options);
const tag = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const clients: Record<'olive' | 'ed' | 'vi' | 'out', SupabaseClient> = {} as never;
let workspaceId = '';
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' });

beforeAll(async () => {
  for (const name of ['olive', 'ed', 'vi', 'out'] as const) {
    const email = `${name}.${tag}@example.com`;
    await admin.auth.admin.createUser({ email, password: 'letters12345', email_confirm: true, user_metadata: { first_name: name } });
    clients[name] = createClient(stack.apiUrl, stack.publishableKey, options);
    await clients[name].auth.signInWithPassword({ email, password: 'letters12345' });
  }
  const { data } = await clients.olive.rpc('create_team_workspace', { p_name: `Storage ${tag}` });
  workspaceId = (data as { id: string }).id;
  const ids = await Promise.all((['ed', 'vi'] as const).map(async (n) => (await clients[n].auth.getUser()).data.user!.id));
  await admin.from('workspace_members').insert([{ workspace_id: workspaceId, user_id: ids[0], role: 'editor' }, { workspace_id: workspaceId, user_id: ids[1], role: 'viewer' }]);
});

describe('storage policies', () => {
  it('lets editors upload into their workspace folder only', async () => {
    expect((await clients.ed.storage.from('project-covers').upload(`${workspaceId}/a.jpg`, jpeg())).error).toBeNull();
    expect((await clients.ed.storage.from('project-covers').upload(`not-a-uuid/b.jpg`, jpeg())).error).not.toBeNull();
    expect((await clients.vi.storage.from('project-covers').upload(`${workspaceId}/v.jpg`, jpeg())).error).not.toBeNull();
    expect((await clients.out.storage.from('project-covers').upload(`${workspaceId}/o.jpg`, jpeg())).error).not.toBeNull();
  });

  it('enforces the cover file type', async () => {
    const text = new Blob(['x'], { type: 'text/plain' });
    expect((await clients.ed.storage.from('project-covers').upload(`${workspaceId}/t.txt`, text)).error).not.toBeNull();
    expect((await clients.ed.storage.from('schedule-imports').upload(`${workspaceId}/${crypto.randomUUID()}/x.xer`, text)).error).toBeNull();
  });

  it('signs URLs for members only', async () => {
    expect((await clients.vi.storage.from('project-covers').createSignedUrl(`${workspaceId}/a.jpg`, 60)).data?.signedUrl).toEqual(expect.any(String));
    expect((await clients.out.storage.from('project-covers').createSignedUrl(`${workspaceId}/a.jpg`, 60)).data).toBeNull();
  });

  it('lets editors delete, and nobody else', async () => {
    const remaining = async () => (await admin.storage.from('project-covers').list(workspaceId)).data!.map((f) => f.name);
    await clients.vi.storage.from('project-covers').remove([`${workspaceId}/a.jpg`]);
    expect(await remaining()).toContain('a.jpg');
    await clients.ed.storage.from('project-covers').remove([`${workspaceId}/a.jpg`]);
    expect(await remaining()).not.toContain('a.jpg');
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npm run test:db` → `06` FAILS; `npm run test:integration` → `storage.itest.ts` FAILS.

- [ ] **Step 3: Implement** the migration, then run `npx supabase db reset`.

- [ ] **Step 4: Run** `npm run test:db && npm run test:integration && npm run check` → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add private storage buckets with workspace policies"
```

---

### Task 13: Invitations Edge Function

**Spec:** §5.7, §6.6 (`account_by_email`, `save_invitation`), §11 V2 (function environment).

**Files:**
- Create: `supabase/functions/invitations/logic.ts`, `supabase/functions/invitations/logic.test.ts`, `supabase/functions/invitations/index.ts`, `supabase/migrations/<ts>_invitations.sql`, `supabase/tests/07_invitations.test.sql`, `integration/invitations.itest.ts`
- Modify:
  - `supabase/config.toml`:
    - add `[functions.invitations]` with `verify_jwt = true`;
    - add `[edge_runtime.secrets]` with `ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:4174"` (not secret). If the installed CLI doesn't support that section, use a git-ignored `supabase/functions/.env` and note it in the verification notes.
  - `vitest.config.ts` (`include` gains `'supabase/functions/**/*.test.ts'`), `eslint.config.js` (ignore `supabase/functions/**/index.ts`), `src/data/supabase/database.types.ts`. `tsconfig.integration.json` already covers `logic*.ts` (Task 1); `index.ts` stays outside every TypeScript project because it is Deno code.

**Interfaces:**
- `logic.ts` — no imports at all:
  ```ts
  export type Role = 'owner' | 'editor' | 'viewer';
  export type InvitationRequest =
    | { action: 'invite'; workspaceId: string; email: string; role: Role }
    | { action: 'revoke'; invitationId: string };
  export interface InviteMetadata { inviter_name: string; workspace_name: string }
  export interface InvitationsStore {
    isOwner(workspaceId: string, userId: string): Promise<boolean>;
    workspace(workspaceId: string): Promise<{ name: string; kind: 'personal' | 'team' } | null>;
    account(email: string): Promise<{ userId: string; confirmed: boolean } | null>;
    isMember(workspaceId: string, userId: string): Promise<boolean>;
    saveInvitation(input: { workspaceId: string; email: string; role: Role; invitedBy: string; userId: string | null }): Promise<'added' | 'pending'>;
    pendingInvitation(id: string): Promise<{ id: string; workspaceId: string; email: string } | null>;
    revoke(id: string): Promise<void>;
    countOtherPending(email: string, exceptId: string): Promise<number>;
    displayName(userId: string): Promise<string>;
  }
  export interface AuthAdmin {
    setMetadata(userId: string, data: InviteMetadata): Promise<void>;
    invite(email: string, data: InviteMetadata): Promise<'sent' | 'rate_limited'>; // throws on other failures
    deleteUser(userId: string): Promise<void>;
  }
  export interface Outcome { status: number; body: { status: 'added' | 'invited' | 'revoked' } | { message: string } }
  export function normalizeEmail(email: string): string; // trim + lowercase
  export function parseRequest(body: unknown): InvitationRequest | null; // UUID /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, email /^[^\s@]+@[^\s@]+\.[^\s@]+$/ after normalizing
  export function handleInvitations(callerId: string | null, body: unknown, deps: { store: InvitationsStore; admin: AuthAdmin }): Promise<Outcome>;
  ```
  - The steps and messages follow P2 spec §5.7. Rate-limited mail returns 429 with "Too many attempts. Wait a minute and try again.".
  - Revoking: a missing or non-pending invitation and a non-owner caller both return the same 403.
- `index.ts` (Deno):
  - Imports `npm:@supabase/supabase-js@2` and `./logic.ts`.
  - Env: `SUPABASE_URL`, the service credential (`SUPABASE_SERVICE_ROLE_KEY`, or the name V2 found) and `ALLOWED_ORIGINS` (comma-separated, trimmed). When `ALLOWED_ORIGINS` is unset or empty, it falls back to `http://localhost:5173,http://localhost:4174`, so a local or CI stack works even if the secret isn't picked up. Production always sets it (runbook, Task 18). If you used the `supabase/functions/.env` fallback above, CI (Task 18) creates the same file before starting the stack.
  - CORS headers: `Access-Control-Allow-Origin` = the request `Origin` only when listed (with `Vary: Origin`), `Access-Control-Allow-Headers: authorization, x-client-info, apikey, content-type`, `Access-Control-Allow-Methods: POST, OPTIONS`. `OPTIONS` → 204 for a listed origin, 403 otherwise.
  - `POST`: caller = `admin.auth.getUser(<bearer token>)`. The store methods use the service client (`workspace_members`, `workspaces`, `workspace_invitations`, `profiles`, `rpc('account_by_email')`, `rpc('save_invitation')`). `AuthAdmin` uses `auth.admin.updateUserById`, `inviteUserByEmail(email, { data })` (429 → `'rate_limited'`) and `deleteUser`. Responses are JSON with the CORS headers.
- `<ts>_invitations.sql`: `public.account_by_email` and `public.save_invitation` per P2 spec §6.6. `revoke execute … from public, anon, authenticated`; `grant execute … to service_role`.

- [ ] **Step 1: Write the failing tests**

`supabase/functions/invitations/logic.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { handleInvitations, type AuthAdmin, type InvitationsStore } from './logic';

const WS = '11111111-1111-4111-8111-111111111111';
const INVITATION = '22222222-2222-4222-8222-222222222222';
const OWNER = 'owner-id';

function deps(store: Partial<InvitationsStore> = {}, admin: Partial<AuthAdmin> = {}) {
  return {
    store: {
      isOwner: vi.fn(async () => true),
      workspace: vi.fn(async () => ({ name: 'Site Operations', kind: 'team' as const })),
      account: vi.fn(async () => null),
      isMember: vi.fn(async () => false),
      saveInvitation: vi.fn(async (input: { userId: string | null }) => (input.userId ? 'added' as const : 'pending' as const)),
      pendingInvitation: vi.fn(async () => ({ id: INVITATION, workspaceId: WS, email: 'pat@example.com' })),
      revoke: vi.fn(async () => {}),
      countOtherPending: vi.fn(async () => 0),
      displayName: vi.fn(async () => 'Deniz Kaya'),
      ...store,
    },
    admin: { setMetadata: vi.fn(async () => {}), invite: vi.fn(async () => 'sent' as const), deleteUser: vi.fn(async () => {}), ...admin },
  };
}
const invite = (email = ' Pat@Example.com ', role = 'editor') => ({ action: 'invite', workspaceId: WS, email, role });
const revoke = { action: 'revoke', invitationId: INVITATION };

describe('invitations logic', () => {
  it('needs a caller and a valid body', async () => {
    expect(await handleInvitations(null, invite(), deps())).toEqual({ status: 401, body: { message: 'Please sign in again.' } });
    for (const body of [null, { ...invite(), workspaceId: 'nope' }, invite('not an email'), invite('pat@example.com', 'admin')]) {
      expect(await handleInvitations(OWNER, body, deps())).toEqual({ status: 400, body: { message: 'Check the email and role.' } });
    }
  });

  it('lets only owners invite, and only into team workspaces', async () => {
    expect(await handleInvitations(OWNER, invite(), deps({ isOwner: async () => false })))
      .toEqual({ status: 403, body: { message: 'Only workspace owners can invite people.' } });
    expect(await handleInvitations(OWNER, invite(), deps({ workspace: async () => ({ name: 'My workspace', kind: 'personal' }) })))
      .toEqual({ status: 400, body: { message: 'Invite people to a team workspace.' } });
  });

  it('refuses current members, however the email was typed', async () => {
    const d = deps({ account: async () => ({ userId: 'u1', confirmed: true }), isMember: async () => true });
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({ status: 409, body: { message: 'pat@example.com is already a member.' } });
  });

  it('adds a confirmed account directly', async () => {
    const d = deps({ account: async () => ({ userId: 'u1', confirmed: true }) });
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({ status: 200, body: { status: 'added' } });
    expect(d.store.saveInvitation).toHaveBeenCalledWith({ workspaceId: WS, email: 'pat@example.com', role: 'editor', invitedBy: OWNER, userId: 'u1' });
    expect(d.admin.invite).not.toHaveBeenCalled();
  });

  it('invites a new email with the inviter and workspace names', async () => {
    const d = deps();
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({ status: 200, body: { status: 'invited' } });
    expect(d.admin.invite).toHaveBeenCalledWith('pat@example.com', { inviter_name: 'Deniz Kaya', workspace_name: 'Site Operations' });
  });

  it('updates the metadata of an unconfirmed account before inviting it again', async () => {
    const d = deps({ account: async () => ({ userId: 'u2', confirmed: false }) });
    expect(await handleInvitations(OWNER, invite(), d)).toEqual({ status: 200, body: { status: 'invited' } });
    expect(d.admin.setMetadata).toHaveBeenCalledWith('u2', { inviter_name: 'Deniz Kaya', workspace_name: 'Site Operations' });
    expect(d.admin.invite).toHaveBeenCalled();
  });

  it('keeps the pending invitation when the email fails or is rate-limited', async () => {
    const failed = deps({}, { invite: async () => { throw new Error('smtp down'); } });
    expect(await handleInvitations(OWNER, invite(), failed)).toEqual({ status: 502, body: { message: "We couldn't send the invitation email." } });
    expect(failed.store.saveInvitation).toHaveBeenCalled();
    expect(await handleInvitations(OWNER, invite(), deps({}, { invite: async () => 'rate_limited' as const })))
      .toEqual({ status: 429, body: { message: 'Too many attempts. Wait a minute and try again.' } });
  });

  it('revokes, deleting only a never-activated account without other invitations', async () => {
    const pending = deps({ account: async () => ({ userId: 'u3', confirmed: false }) });
    expect(await handleInvitations(OWNER, revoke, pending)).toEqual({ status: 200, body: { status: 'revoked' } });
    expect(pending.store.revoke).toHaveBeenCalledWith(INVITATION);
    expect(pending.admin.deleteUser).toHaveBeenCalledWith('u3');
    const busy = deps({ account: async () => ({ userId: 'u3', confirmed: false }), countOtherPending: async () => 1 });
    await handleInvitations(OWNER, revoke, busy);
    expect(busy.admin.deleteUser).not.toHaveBeenCalled();
    const active = deps({ account: async () => ({ userId: 'u4', confirmed: true }) });
    await handleInvitations(OWNER, revoke, active);
    expect(active.admin.deleteUser).not.toHaveBeenCalled();
  });

  it('lets only owners revoke pending invitations', async () => {
    const forbidden = { status: 403, body: { message: 'Only workspace owners can revoke invitations.' } };
    expect(await handleInvitations(OWNER, revoke, deps({ isOwner: async () => false }))).toEqual(forbidden);
    expect(await handleInvitations(OWNER, revoke, deps({ pendingInvitation: async () => null }))).toEqual(forbidden);
  });
});
```

`supabase/tests/07_invitations.test.sql`:

```sql
begin;
\ir _helpers.psql
select plan(9);

select function_privs_are('public', 'account_by_email', array['text'], 'authenticated', array[]::text[], 'signed-in users cannot look up accounts');
select function_privs_are('public', 'account_by_email', array['text'], 'anon', array[]::text[], 'nor can anon');
select function_privs_are('public', 'account_by_email', array['text'], 'service_role', array['EXECUTE'], 'the service role can');
select function_privs_are('public', 'save_invitation', array['uuid', 'text', 'text', 'uuid', 'uuid'], 'authenticated', array[]::text[], 'only the service role saves invitations');

do $$
begin
  perform tests.team_workspace('Crew', tests.create_user('olive@test.dev'));
  perform tests.create_user('pending@test.dev', false);
  perform tests.create_user('cara@test.dev');
end $$;
select results_eq($$ select confirmed from public.account_by_email(' PENDING@test.dev ') $$, $$ values (false) $$, 'lookups ignore case and spaces');
select is(public.save_invitation(tests.workspace_id('Crew'), 'pat@test.dev', 'editor', tests.user_id('olive@test.dev'), null), 'pending', 'a new email gets a pending invitation');
select is(public.save_invitation(tests.workspace_id('Crew'), 'pat@test.dev', 'viewer', tests.user_id('olive@test.dev'), null), 'pending', 'saving again keeps it pending');
select results_eq($$ select role from public.workspace_invitations where email = 'pat@test.dev' and accepted_at is null and revoked_at is null $$,
  $$ values ('viewer'::text) $$, 'with the latest role, in one row');
select is(public.save_invitation(tests.workspace_id('Crew'), 'cara@test.dev', 'editor', tests.user_id('olive@test.dev'), tests.user_id('cara@test.dev')), 'added', 'a confirmed account is added at once');

select * from finish();
rollback;
```

`integration/invitations.itest.ts`:

```ts
import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { readLocalStack } from './local-stack';
import { waitForEmail } from './mailbox';

const stack = readLocalStack();
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(stack.apiUrl, stack.secretKey, options);
const url = `${stack.apiUrl}/functions/v1/invitations`;
const tag = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
let token = '';
let workspaceId = '';

async function call(body: unknown, auth: string | null = token, origin = 'http://localhost:5173') {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: stack.publishableKey, origin, ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null), origin: response.headers.get('access-control-allow-origin') };
}

beforeAll(async () => {
  const email = `owner.${tag}@example.com`;
  await admin.auth.admin.createUser({ email, password: 'letters12345', email_confirm: true, user_metadata: { first_name: 'Olive', last_name: 'Owner' } });
  const client = createClient(stack.apiUrl, stack.publishableKey, options);
  token = (await client.auth.signInWithPassword({ email, password: 'letters12345' })).data.session!.access_token;
  workspaceId = ((await client.rpc('create_team_workspace', { p_name: `Crew ${tag}` })).data as { id: string }).id;
});

describe('invitations function', () => {
  it('answers CORS preflight for listed origins only', async () => {
    const preflight = (origin: string) => fetch(url, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
    expect((await preflight('http://localhost:5173')).headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect((await preflight('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('needs a session', async () => {
    expect((await call({ action: 'invite', workspaceId, email: 'a@example.com', role: 'editor' }, null)).status).toBe(401);
  });

  it('invites, then revoking deletes the never-activated account', async () => {
    const email = `invitee.${tag}@example.com`;
    const after = new Date();
    expect(await call({ action: 'invite', workspaceId, email, role: 'editor' })).toMatchObject({ status: 200, body: { status: 'invited' }, origin: 'http://localhost:5173' });
    expect((await waitForEmail(stack.mailUrl, email, { after })).html).toContain(`Olive Owner invited you to the Crew ${tag} workspace.`);
    const { data: invitation } = await admin.from('workspace_invitations').select('id').eq('email', email).is('revoked_at', null).single();
    expect(await call({ action: 'revoke', invitationId: invitation!.id })).toMatchObject({ status: 200, body: { status: 'revoked' } });
    expect((await admin.rpc('account_by_email', { p_email: email })).data).toEqual([]);
  });

  it('adds an existing account directly', async () => {
    const email = `member.${tag}@example.com`;
    await admin.auth.admin.createUser({ email, password: 'letters12345', email_confirm: true });
    expect(await call({ action: 'invite', workspaceId, email, role: 'viewer' })).toMatchObject({ status: 200, body: { status: 'added' } });
  });
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run supabase/functions` → FAIL. `npm run test:db` → `07` FAILS. `npm run test:integration` → `invitations.itest.ts` FAILS.

- [ ] **Step 3: Implement** `logic.ts`, `index.ts` and the migration. Run `npx supabase db reset && npm run db:types`, then restart the stack (`npm run db:stop && npm run db:start`) so the functions runtime picks up the function and its secret. If `supabase start` doesn't serve functions in the installed CLI, run `npx supabase functions serve` in a second terminal and record that.

- [ ] **Step 4: Run** `npm run check && npm run test:db && npm run test:integration` → all pass. Record the V2 function-environment result in the verification notes.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the invitations Edge Function"
```

---

### Task 14: Supabase adapter foundations

**Spec:** §8.1, §8.2 (mapping notes), §8.4, D5, D10.

**Files:**
- Create: `src/data/supabase/client.ts`, `src/data/supabase/mappers.ts`, `src/data/supabase/errors.ts`, `src/data/supabase/signed-urls.ts`
- Test: `src/data/supabase/client.test.ts`, `src/data/supabase/mappers.test.ts`, `src/data/supabase/errors.test.ts`, `src/data/supabase/signed-urls.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // client.ts
  export type AppSupabaseClient = SupabaseClient<Database>;
  export function createStorageAdapter(storage: StorageLike | null): { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
  //   wraps readKey / writeKey / removeKey over `storage ?? createMemoryStorage()`
  export function createSupabaseClient(config: { url: string; publishableKey: string; storage: StorageLike | null }): AppSupabaseClient; // options from P2 spec §8.1
  // mappers.ts (row types come from database.types.ts)
  export function toIso(value: string): ISODateTime;
  export function mapUser(row): User;  export function mapSubscription(row): Subscription;
  export function mapWorkspace(row): Workspace;  export function mapWorkspaceSummary(row): WorkspaceSummary;
  export function mapProject(row, coverUrl: string | null): Project;  export function mapProjectSummary(row, coverUrl: string | null): ProjectSummary;
  export function mapSchedule(row): Schedule;  export function mapSharedRow(row): SharedScheduleRow;  export function mapTask(row): Task;
  export function mapMember(row: { user_id: string; role: string; joined_at: string; profiles: { first_name: string; last_name: string; email: string } }): WorkspaceMember;
  export function mapInvitation(row): WorkspaceInvitation;
  export function toProjectInsert(input: NewProjectInput, coverPath: string | null); // trims; '' → null; snake_case columns
  // errors.ts
  export function toRepositoryError(error: unknown, context?: { notFound?: string }): RepositoryError;
  export function functionError(error: unknown): Promise<RepositoryError>; // FunctionsHttpError: status + JSON { message }
  // signed-urls.ts
  export interface SignedUrlCache { urlsFor(bucket: string, paths: string[]): Promise<Map<string, string>> }
  export function createSignedUrlCache(
    sign: (bucket: string, paths: string[], expiresIn: number) => Promise<Array<{ path: string; signedUrl: string }>>,
    now?: () => number,
  ): SignedUrlCache; // signs 3600 s; reuses a URL while more than 10 minutes remain; one batch for the missing paths
  ```
- `toRepositoryError` implements the P2 spec §8.4 table:
  - `not_found` uses `context.notFound` or "Something went wrong. Please try again.".
  - Postgres errors are recognized by `code`, auth errors by `code` / `status` / `name`, storage errors by `status` or `statusCode`.
  - `TypeError` and `AuthRetryableFetchError` map to `network`.
  - PostgREST `PGRST301` (expired JWT) and any HTTP 401 map to `unauthorized`, which triggers the session-expiry handling from Task 4.

- [ ] **Step 1: Write the failing tests**

`src/data/supabase/client.test.ts`:

```ts
import { expect, it } from 'vitest';
import { createStorageAdapter } from '@/data/supabase/client';
import { createMemoryStorage } from '@/lib/storage';

it('keeps the session in memory when browser storage is blocked', () => {
  const storage = createStorageAdapter(null);
  storage.setItem('sb-auth', 'token');
  expect(storage.getItem('sb-auth')).toBe('token');
  storage.removeItem('sb-auth');
  expect(storage.getItem('sb-auth')).toBeNull();
});

it('writes through to browser storage when it exists', () => {
  const memory = createMemoryStorage();
  createStorageAdapter(memory).setItem('k', 'v');
  expect(memory.getItem('k')).toBe('v');
});
```

`src/data/supabase/mappers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapMember, mapProjectSummary, mapSharedRow, toProjectInsert } from '@/data/supabase/mappers';
import { makeNewProjectInput } from '@/test/fakes';

describe('mappers', () => {
  it('maps a project summary, nesting groups and normalizing timestamps', () => {
    const row = {
      id: 'p1', workspace_id: 'w1', code: '001', name: 'Pier', description: null, cover_image_path: 'w1/c.jpg', status_date: '2026-10-12',
      project_type: 'building', start_date: null, planned_finish_date: null, client_name: 'Acme', client_contact_name: null, client_contact_email: null,
      location_address: null, location_city: 'Izmir', location_country: 'TR', created_at: '2026-10-14T09:30:00.123456+00:00', updated_at: '2026-10-14T09:31:00+00:00', schedule_count: 2,
    };
    expect(mapProjectSummary(row, 'https://signed/url')).toEqual({
      id: 'p1', workspaceId: 'w1', code: '001', name: 'Pier', description: null, coverImageUrl: 'https://signed/url', statusDate: '2026-10-12',
      attributes: { projectType: 'building', startDate: null, plannedFinishDate: null },
      client: { name: 'Acme', contactName: null, contactEmail: null },
      location: { address: null, city: 'Izmir', country: 'TR' },
      createdAt: '2026-10-14T09:30:00.123Z', updatedAt: '2026-10-14T09:31:00.000Z', scheduleCount: 2,
    });
  });

  it('maps a member with their profile', () => {
    expect(mapMember({ user_id: 'u1', role: 'editor', joined_at: '2026-10-01T00:00:00+00:00', profiles: { first_name: 'Mert', last_name: 'Demir', email: 'mert@example.com' } }))
      .toEqual({ userId: 'u1', firstName: 'Mert', lastName: 'Demir', email: 'mert@example.com', role: 'editor', joinedAt: '2026-10-01T00:00:00.000Z' });
  });

  it('maps a shared row with its sharer', () => {
    expect(mapSharedRow({
      share_id: 's1', schedule_id: 'sc1', schedule_name: 'Baseline rev. 3', status_date: null, project_id: 'p1', project_name: 'Tunnel', workspace_id: 'w1',
      shared_by_id: 'u2', shared_by_first_name: 'Mert', shared_by_last_name: 'Demir', shared_by_avatar_url: null, shared_at: '2026-10-13T10:00:00+00:00',
    })).toEqual({
      shareId: 's1', scheduleId: 'sc1', scheduleName: 'Baseline rev. 3', statusDate: null, projectId: 'p1', projectName: 'Tunnel', workspaceId: 'w1',
      sharedBy: { id: 'u2', firstName: 'Mert', lastName: 'Demir', avatarUrl: null }, sharedAt: '2026-10-13T10:00:00.000Z',
    });
  });

  it('builds a project insert from the form input', () => {
    const input = makeNewProjectInput('w1', { code: ' 007 ', name: ' Pier ', description: '', client: { name: ' Acme ', contactName: '', contactEmail: null } });
    expect(toProjectInsert(input, 'w1/c.jpg')).toMatchObject({
      workspace_id: 'w1', code: '007', name: 'Pier', description: null, cover_image_path: 'w1/c.jpg', client_name: 'Acme', client_contact_name: null,
    });
  });
});
```

`src/data/supabase/errors.test.ts`:

```ts
import { AuthApiError, AuthRetryableFetchError, FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { functionError, toRepositoryError } from '@/data/supabase/errors';

const pg = (code: string, message = 'x', hint = '') => ({ code, message, details: '', hint });

describe('toRepositoryError', () => {
  it.each([
    [pg('23505', 'duplicate key value violates unique constraint "projects_workspace_code_uq"'), 'conflict', 'This ID is already used in this workspace'],
    [pg('23514', 'A workspace needs at least one owner.', 'app'), 'validation', 'A workspace needs at least one owner.'],
    [pg('23514', 'new row violates check constraint "x"'), 'validation', "Some values aren't valid. Check the form and try again."],
    [pg('42501', 'new row violates row-level security policy'), 'forbidden', expect.any(String)],
    [pg('PGRST301', 'JWT expired'), 'unauthorized', expect.any(String)],
    [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'unauthorized', 'Wrong email or password'],
    [new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'), 'validation', 'This link has expired or was already used.'],
    [new AuthApiError('Password is too weak', 422, 'weak_password'), 'validation', 'Use at least 10 characters with letters and numbers'],
    [new AuthApiError('Same password', 422, 'same_password'), 'validation', 'Choose a different password from your current one.'],
    [new AuthApiError('Too many requests', 429, 'over_request_rate_limit'), 'rate_limited', expect.any(String)],
    [new AuthRetryableFetchError('Failed to fetch', 0), 'network', expect.any(String)],
    [{ name: 'StorageApiError', message: 'denied', status: 403 }, 'forbidden', expect.any(String)],
    [{ name: 'StorageApiError', message: 'too big', statusCode: '413' }, 'validation', 'This file is too large.'],
    [new TypeError('Failed to fetch'), 'network', expect.any(String)],
    [new Error('???'), 'unknown', expect.any(String)],
  ])('maps %o', (error, code, message) => {
    expect(toRepositoryError(error)).toMatchObject({ code, message });
  });

  it('uses the caller\'s not-found message', () => {
    expect(toRepositoryError(pg('PGRST116'), { notFound: 'Task not found' })).toMatchObject({ code: 'not_found', message: 'Task not found' });
  });
});

describe('functionError', () => {
  it.each([[400, 'validation'], [401, 'unauthorized'], [403, 'forbidden'], [409, 'conflict'], [429, 'rate_limited'], [502, 'unknown']])(
    'maps status %i to %s with the function message', async (status, code) => {
      const error = new FunctionsHttpError(new Response(JSON.stringify({ message: 'pat@example.com is already a member.' }), { status }));
      expect(await functionError(error)).toMatchObject({ code, message: 'pat@example.com is already a member.' });
    });

  it('maps fetch failures to network', async () => {
    expect(await functionError(new FunctionsFetchError('offline'))).toMatchObject({ code: 'network' });
  });
});
```

`src/data/supabase/signed-urls.test.ts`:

```ts
import { expect, it, vi } from 'vitest';
import { createSignedUrlCache } from '@/data/supabase/signed-urls';

it('signs missing paths in one batch and reuses URLs that are still fresh', async () => {
  let now = 0;
  const sign = vi.fn(async (_bucket: string, paths: string[]) => paths.map((path) => ({ path, signedUrl: `https://s/${path}?t=${now}` })));
  const cache = createSignedUrlCache(sign, () => now);
  expect([...(await cache.urlsFor('project-covers', ['a', 'b'])).values()]).toEqual(['https://s/a?t=0', 'https://s/b?t=0']);
  now = 49 * 60_000;
  await cache.urlsFor('project-covers', ['a', 'b', 'c']);
  expect(sign).toHaveBeenLastCalledWith('project-covers', ['c'], 3600);
  now = 51 * 60_000;
  expect((await cache.urlsFor('project-covers', ['a'])).get('a')).toBe(`https://s/a?t=${51 * 60_000}`);
  expect(sign).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/data/supabase` → FAIL.

- [ ] **Step 3: Implement** the four modules per Interfaces. Message copy comes from P2 spec §8.4 and §6.1.

- [ ] **Step 4: Run** `npm run check` → all checks pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the Supabase client, mappers, error mapping and signed URLs"
```

---

### Task 15: `SupabaseRepository` and the local seed

**Spec:** §8.2, §9 (repository contract on Supabase, seed loader), §4.4 (`db:reset`).

**Files:**
- Create: `src/data/supabase/SupabaseRepository.ts`, `integration/seed-loader.ts`, `integration/supabase-fixture.ts`, `integration/supabase.contract.itest.ts`, `scripts/seed-local.ts`
- Modify: `package.json` (`db:reset` = `supabase db reset && tsx scripts/seed-local.ts`)

**Interfaces:**
- Consumes: Task 14 modules; `seed` (Task 3); `runRepositoryContract` (Tasks 2–3); `readLocalStack` (Task 1).
- Produces:
  ```ts
  // src/data/supabase/SupabaseRepository.ts
  export class SupabaseRepository implements DataRepository {
    constructor(client: AppSupabaseClient, options?: { signedUrls?: SignedUrlCache }); // default cache signs through client.storage.createSignedUrls
  }
  // integration/seed-loader.ts
  export interface SeedAccount { id: ID; email: string; password: string; firstName: string; lastName: string }
  export interface LoadedSeed {
    users: { current: SeedAccount; mert: SeedAccount | null; elif: SeedAccount | null };
    workspaces: { personal: ID; team: ID | null };
    projectIds: Record<string, ID>;
    pendingInvitationEmail: string | null;
    trialEndsAt: ISODateTime;
  }
  export function tagEmail(email: string, tag?: string): string; // ('a@x.com', 'k1') → 'a+k1@x.com'
  export function loadSeed(admin: SupabaseClient<Database>, options: { scenario: 'default' | 'empty'; now: Date; password: string; teamRole?: Role; tag?: string }): Promise<LoadedSeed>;
  // integration/supabase-fixture.ts
  export function signedInClient(email: string, password: string): Promise<AppSupabaseClient>;
  export const makeSupabaseRepositoryFixture: MakeRepositoryFixture; // a fresh tag per call, password 'letters12345'
  ```
- `loadSeed` follows P2 spec §9 ("Supabase seed loader"):
  - Users are created with `admin.auth.admin.createUser({ email: tagEmail(…), password, email_confirm: true, user_metadata: { first_name, last_name } })`.
  - The seed's personal workspace maps onto the one the bootstrap created for Deniz.
  - Team workspaces, projects and schedules keep the seed's ids, so the tests can find them. Projects and schedules also keep the seed's timestamps.
  - Bootstrap already created the personal memberships; insert only the team memberships.
  - Afterwards, set each project's `updated_at` and Deniz's `trial_ends_at` to the seed values.
- `SupabaseRepository` follows P2 spec §8.2, plus:
  - **Ids:** ids that aren't UUIDs behave as unknown ids (empty lists, `not_found`).
  - **Signed in:** `getCurrentUser` needs a session, else `RepositoryError('unauthorized', 'Your session expired. Please sign in again.')`.
  - **Schedules:** `createSchedule` and `importSchedule` first read the project's `id, workspace_id` (missing → `not_found` "Project not found"). The import key is `{workspaceId}/{projectId}/{uuid}{.ext lowercased}`, uploaded with `contentType: file.type || 'application/octet-stream'` and `upsert: false`.
  - **Covers:** the cover key ends in `.png` for `image/png`, otherwise `.jpg`.
  - **Cleanup:** after a failed insert, `storage.remove([path])` (errors ignored).
  - **Not-found messages:** `setTaskDone` uses `maybeSingle()` with `notFound: 'Task not found'`.
  - **Function calls:** member operations through the function go through `functionError`; everything else through `toRepositoryError`.
- `scripts/seed-local.ts`:
  1. Read the stack with `readLocalStack()`.
  2. Build an admin client from `secretKey`.
  3. `loadSeed(admin, { scenario: 'default', now: new Date(), password: 'localdemo2026' })`.
  4. Print the three accounts and `Password for all local accounts: localdemo2026`.

- [ ] **Step 1: Write the failing test** — `integration/supabase.contract.itest.ts`

```ts
import { runRepositoryContract } from '@/test/contract/repository.contract';
import { makeSupabaseRepositoryFixture } from './supabase-fixture';

runRepositoryContract('supabase', makeSupabaseRepositoryFixture);
```

- [ ] **Step 2: Run it to see it fail** — `npm run test:integration` → FAIL (modules not found).

- [ ] **Step 3: Implement** `seed-loader.ts`, `supabase-fixture.ts`, `SupabaseRepository.ts` and `scripts/seed-local.ts`. Then update the `db:reset` script.

- [ ] **Step 4: Run**

```bash
npm run db:reset
npm run test:integration
npm run check
```
Expected:
- `db:reset` prints the three local accounts.
- The Supabase contract run passes every case the mock passes.
- `check` is green.

A failing case is an adapter bug or a missing database rule, never a reason to weaken the shared suite. If the database can't express a rule the mock follows, stop and ask the owner.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the Supabase repository and the local seed"
```

---

### Task 16: `SupabaseAuthService` and the data-layer switch

**Spec:** §4.2, §5.3, §8.1, §8.4 (auth rows), §9 (auth contract on Supabase).

**Files:**
- Create: `src/data/supabase/SupabaseAuthService.ts`, `src/data/supabase/SupabaseAuthService.test.ts`, `integration/supabase-auth.contract.itest.ts`
- Modify: `src/data/index.ts`, `src/data/index.test.ts` (the "not implemented yet" case is replaced), `integration/supabase-fixture.ts` (`makeSupabaseAuthFixture`), `src/vite-env.d.ts` (`VITE_SUPABASE_PUBLISHABLE_KEY` replaces `VITE_SUPABASE_ANON_KEY`), `.env.example`, `package.json` (`dev:supabase` = `vite --mode supabase`)

**Interfaces:**
- Produces:
  ```ts
  export class SupabaseAuthService implements AuthService {
    constructor(client: AppSupabaseClient, options: { origin: () => string }); // createDataLayer passes () => window.location.origin
  }
  export const makeSupabaseAuthFixture: () => Promise<AuthFixture>; // integration/supabase-fixture.ts
  // src/data/index.ts — DataLayerEnv gains VITE_SUPABASE_URL?: string; VITE_SUPABASE_PUBLISHABLE_KEY?: string
  ```
- Pins (P2 spec §5.3, §8.4):
  - **`completeOAuthSignIn(url)`:**
    - It reads `error`, `error_code` and `error_description` from both the query and the hash.
    - `error_code=signup_disabled`, or a description matching `/sign ?ups? not allowed/i`, rejects with `forbidden` "This Google account has no access yet. Ask a workspace owner to invite you.".
    - Any other error, a failed exchange, or a URL with neither `code` nor an error rejects with `unauthorized` "Google sign-in didn't work. Please try again.".
    - A `code` calls `exchangeCodeForSession(code)`.
  - **`signInWithGoogle(next)`:** calls `signInWithOAuth({ provider: 'google', options: { redirectTo } })`, where `redirectTo` is `${origin()}/auth/callback`, plus `?next=${encodeURIComponent(next)}` when `next` is set.
  - **`requestPasswordReset`:** HTTP 429 → `rate_limited`; a fetch failure → `network`; every other error is swallowed.
  - **`verifyEmailLink`:** `verifyOtp({ token_hash, type })`. A fetch failure → `network`; any other error → `validation` "This link has expired or was already used.".
  - **`signOut`:** `signOut({ scope: 'local' })`.
  - **`onAuthStateChange`:** P2 spec §5.3 — the callback forwards only `{ userId }` or `null`.
  - **`createDataLayer`, source `supabase`:**
    - It requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, throwing `Missing VITE_SUPABASE_URL` / `Missing VITE_SUPABASE_PUBLISHABLE_KEY`.
    - It builds one client with `createSupabaseClient({ url, publishableKey, storage })` and returns `{ repository: new SupabaseRepository(client), auth: new SupabaseAuthService(client, { origin: () => window.location.origin }) }`.
    - No network call happens at construction.
  - **`.env.example`:** the P2 spec §4.2 variables, Supabase ones commented out, with a note that `npm run dev:supabase` reads `.env.supabase` and `.env.supabase.local`.

- [ ] **Step 1: Write the failing tests**

`src/data/supabase/SupabaseAuthService.test.ts`:

```ts
import { AuthApiError } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AppSupabaseClient } from '@/data/supabase/client';
import { SupabaseAuthService } from '@/data/supabase/SupabaseAuthService';

function setup() {
  let listener: (event: string, session: { user: { id: string } } | null) => void = () => {};
  const auth = {
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null as unknown })),
    onAuthStateChange: vi.fn((cb: typeof listener) => { listener = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; }),
  };
  const service = new SupabaseAuthService({ auth } as unknown as AppSupabaseClient, { origin: () => 'https://app.example' });
  return { service, auth, emit: (event: string, session: { user: { id: string } } | null) => listener(event, session) };
}

describe('SupabaseAuthService', () => {
  it('turns a refused Google sign-up into no-access', async () => {
    const { service } = setup();
    await expect(service.completeOAuthSignIn('https://app.example/auth/callback?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance'))
      .rejects.toMatchObject({ code: 'forbidden', message: 'This Google account has no access yet. Ask a workspace owner to invite you.' });
  });

  it('reports any other callback problem as a failed sign-in', async () => {
    const { service } = setup();
    for (const url of ['https://app.example/auth/callback#error=server_error&error_description=boom', 'https://app.example/auth/callback']) {
      await expect(service.completeOAuthSignIn(url)).rejects.toMatchObject({ code: 'unauthorized', message: "Google sign-in didn't work. Please try again." });
    }
  });

  it('exchanges the code once', async () => {
    const { service, auth } = setup();
    await service.completeOAuthSignIn('https://app.example/auth/callback?code=abc&next=%2Fhome');
    expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });

  it('builds the Google redirect from the origin and the next path', async () => {
    const { service, auth } = setup();
    await service.signInWithGoogle('/w/1/projects');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://app.example/auth/callback?next=%2Fw%2F1%2Fprojects' } });
    await service.signInWithGoogle(null);
    expect(auth.signInWithOAuth).toHaveBeenLastCalledWith({ provider: 'google', options: { redirectTo: 'https://app.example/auth/callback' } });
  });

  it('signs out on this device only', async () => {
    const { service, auth } = setup();
    await service.signOut();
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('hides whether an account exists but reports rate limits', async () => {
    const { service, auth } = setup();
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthApiError('User not found', 400, 'user_not_found') });
    await expect(service.requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
    auth.resetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: new AuthApiError('Too many requests', 429, 'over_email_send_rate_limit') });
    await expect(service.requestPasswordReset('nobody@example.com')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('forwards only the user id to listeners', () => {
    const { service, emit } = setup();
    const seen: unknown[] = [];
    service.onAuthStateChange((session) => seen.push(session));
    emit('SIGNED_IN', { user: { id: 'u1' } });
    emit('SIGNED_OUT', null);
    expect(seen).toEqual([{ userId: 'u1' }, null]);
  });
});
```

`src/data/index.test.ts` — replace the "not implemented yet" case:

```ts
it('needs the Supabase URL and publishable key', () => {
  expect(() => createDataLayer({ VITE_DATA_SOURCE: 'supabase' }, null)).toThrow('Missing VITE_SUPABASE_URL');
  expect(() => createDataLayer({ VITE_DATA_SOURCE: 'supabase', VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }, null)).toThrow('Missing VITE_SUPABASE_PUBLISHABLE_KEY');
});

it('builds the Supabase layer without touching the network', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  const layer = createDataLayer({ VITE_DATA_SOURCE: 'supabase', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }, null);
  expect(layer.repository).toBeInstanceOf(SupabaseRepository);
  expect(layer.auth).toBeInstanceOf(SupabaseAuthService);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

`integration/supabase-auth.contract.itest.ts`:

```ts
import { runAuthContract } from '@/test/contract/auth.contract';
import { makeSupabaseAuthFixture } from './supabase-fixture';

runAuthContract('supabase', makeSupabaseAuthFixture);
```
`makeSupabaseAuthFixture`:
- creates a confirmed account with a unique email and the password `letters12345`;
- returns a `SupabaseAuthService` over `createSupabaseClient({ url, publishableKey, storage: null })`, signed in;
- `badPassword` is `'wrong-password-1'`;
- `freshToken()` returns `(await admin.auth.admin.generateLink({ type: 'recovery', email })).data.properties.hashed_token`.

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/data` → FAIL; `npm run test:integration` → the auth contract FAILS.

- [ ] **Step 3: Implement** everything in Interfaces.

- [ ] **Step 4: Run** `npm run check && npm run test:integration` → all pass. (Optional owner check, skipped when unattended: `npm run dev:supabase`, open http://localhost:5173, sign in as `deniz.kaya@example.com` / `localdemo2026`.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add the Supabase auth service and switch the data layer by env"
```

---

### Task 17: End-to-end tests on the local stack

**Spec:** §2.2 S3, S6; §9 (E2E Supabase).

**Files:**
- Create: `playwright.supabase.config.ts`, `e2e-supabase/supabase.spec.ts`
- Modify: `package.json` (`test:e2e:supabase` = `playwright test -c playwright.supabase.config.ts`). `tsconfig.integration.json` already includes both new paths (Task 1).

**Interfaces:**
- Consumes: `readLocalStack` (Task 1), `waitForEmail`, `tokenHashFrom` (Task 1); the seeded local accounts (Task 15).
- `playwright.supabase.config.ts`: like Phase 1's config, but with:
  - `testDir: 'e2e-supabase'`, `fullyParallel: false`, `workers: 1` (the tests share seeded accounts);
  - `baseURL: 'http://localhost:4174'`, project name `supabase`;
  - `webServer.command: 'npm run build -- --mode supabase && npm run preview -- --port 4174 --strictPort'`, with the same url, `reuseExistingServer: !process.env.CI` and `timeout: 180_000`.
- Before running: `npm run db:start && npm run db:reset && npm run db:env`.

- [ ] **Step 1: Write the tests** — `e2e-supabase/supabase.spec.ts`

```ts
import { expect, test, type Page } from '@playwright/test';
import { readLocalStack } from '../integration/local-stack';
import { tokenHashFrom, waitForEmail } from '../integration/mailbox';

const PASSWORD = 'localdemo2026';

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('a seeded account signs in with a password', async ({ page }) => {
  await signIn(page, 'deniz.kaya@example.com');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello, Deniz' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent projects' }).getByRole('article')).toHaveCount(5);
});

test('created data is still there after a reload', async ({ page }) => {
  await signIn(page, 'deniz.kaya@example.com');
  const name = `E2E crew ${Date.now() % 100_000}`;
  const workspaces = page.getByRole('region', { name: 'Workspaces' });
  await workspaces.getByRole('button', { name: 'New team workspace', exact: true }).click();
  await page.getByLabel('Workspace name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(workspaces.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  await page.reload();
  await expect(workspaces.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
});

test('a viewer cannot create anything in the team workspace', async ({ page }) => {
  await signIn(page, 'elif.arslan@example.com');
  await page.getByRole('region', { name: 'Workspaces' }).getByRole('button', { name: /^Site Operations/ }).click();
  await page.goto('/home');
  await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveAttribute('aria-disabled', 'true');
});

test('an invited person accepts and lands in the team workspace', async ({ page, browser }) => {
  const stack = readLocalStack();
  const email = `invitee.${Date.now()}@example.com`;
  await signIn(page, 'deniz.kaya@example.com');
  await page.getByRole('button', { name: 'Members of Site Operations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Members of Site Operations' });
  const sentAfter = new Date();
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();

  const mail = await waitForEmail(stack.mailUrl, email, { after: sentAfter, subject: "You're invited to AppName" });
  const context = await browser.newContext({ baseURL: 'http://localhost:4174' });
  const invitee = await context.newPage();
  await invitee.goto(`/accept-invite?token_hash=${tokenHashFrom(mail.html)}&type=invite`);
  await invitee.getByLabel('First name', { exact: true }).fill('Ada');
  await invitee.getByLabel('Last name', { exact: true }).fill('Lovelace');
  await invitee.getByLabel('Password', { exact: true }).fill('letters12345');
  await invitee.getByLabel('Confirm password', { exact: true }).fill('letters12345');
  await invitee.getByRole('button', { name: 'Create account' }).click();
  await expect(invitee.getByRole('heading', { level: 1, name: 'Hello, Ada' })).toBeVisible();
  await expect(invitee.getByRole('region', { name: 'Workspaces' }).getByRole('button', { name: /^Site Operations/ })).toBeVisible();
  await context.close();
});
```

- [ ] **Step 2: Run** `npm run test:e2e:supabase`
Expected: `4 passed`. Fix the app, not the test, when a step fails. A timeout in `waitForEmail` means the function or the mail catcher isn't reachable (Task 13 notes).

- [ ] **Step 3: Run** `npm run check && npm run test:e2e` → all pass (the mock suite is unaffected).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test: add end-to-end flows on the local Supabase stack"
```

---

### Task 18: Production hardening and CI

**Spec:** §2.2 S5, S7; §9 (secrets, CI); §10 (headers, theme script, runbook, migration rules, data protection).

**Files:**
- Create: `public/_headers`, `public/theme-init.js`, `scripts/check-secrets.mjs`, `scripts/check-secrets.test.mjs`, `scripts/headers.test.mjs`, `.github/workflows/ci.yml`, `docs/runbooks/production.md`
- Modify: `index.html` (the inline theme script becomes `<script src="/theme-init.js"></script>` in the same place), `package.json` (`check:secrets` = `node scripts/check-secrets.mjs`), `eslint.config.js` (a block for `public/**/*.js`)

**Interfaces:**
- `public/theme-init.js`: Phase 1's inline theme function, moved with the same `try` / `catch` behavior. One change: `catch (e) {` becomes `catch {`, because ESLint 9's `no-unused-vars` reports the unused `e` once the code is in a linted file.
- `eslint.config.js` gains `{ files: ['public/**/*.js'], languageOptions: { sourceType: 'script', globals: globals.browser } }`. Without it, `@eslint/js` recommended reports `document` and `localStorage` as undefined (`no-undef`).
- `public/_headers`:

```text
/*
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
```

- `scripts/check-secrets.mjs`:
  - exports `findSecrets(files: Array<{ path: string; content: string }>, options?: { secretValue?: string }): string[]`;
  - finding texts are `<path>: sb_secret_ key`, `<path>: service_role JWT` and `<path>: SUPABASE_SECRET_KEY value`;
  - to find JWTs, it matches `/eyJ[\w-]+\.(eyJ[\w-]+)\.[\w-]*/g` and base64url-decodes the payload;
  - run directly, it reads every `.js`, `.css`, `.html`, `.json` and `.map` file under `dist/` and takes `secretValue` from `process.env.SUPABASE_SECRET_KEY`;
  - it prints the findings and exits 1, or prints `No secrets found in dist/`.
- `.github/workflows/ci.yml` — two jobs on `push` to `main` and on `pull_request` (use the current major versions of the actions if newer ones exist):

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  app:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run check
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  supabase:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx supabase start
      - run: npm run db:env
      - run: npm run db:reset
      - name: Generated types are current
        run: npx supabase gen types typescript --local > /tmp/database.types.ts && diff -u src/data/supabase/database.types.ts /tmp/database.types.ts
      - run: npm run test:db
      - run: npm run test:integration
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:supabase
      - name: No secret in the bundle
        run: |
          npm run build -- --mode supabase
          export SUPABASE_SECRET_KEY="$(npx supabase status -o json | node -e "const s = JSON.parse(require('fs').readFileSync(0, 'utf8')); process.stdout.write(s.SECRET_KEY || s.SERVICE_ROLE_KEY || '')")"
          npm run check:secrets
```

- `docs/runbooks/production.md`:
  - P2 spec §10 steps 1–9 as a checklist;
  - with step 1 (create the project): if the dashboard offers the cloud equivalent of `[api] auto_expose_new_tables = false` (new tables get no API-role grants automatically), turn it off so production matches local. The migrations revoke and grant explicitly either way;
  - its "Migration rules" and "Data protection" paragraphs;
  - a "Record" section where the owner notes the date and result of S4 (Google sign-in), V1(d), V6 (SPA fallback and headers) and S8.

- [ ] **Step 1: Write the failing tests**

`scripts/check-secrets.test.mjs`:

```js
import { describe, expect, it } from 'vitest';
import { findSecrets } from './check-secrets.mjs';

const jwt = (payload) => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'signature'].join('.');

describe('findSecrets', () => {
  it('flags secret keys, service-role tokens and the exact secret value', () => {
    expect(findSecrets([{ path: 'a.js', content: 'const k = "sb_secret_abc123"' }])).toEqual(['a.js: sb_secret_ key']);
    expect(findSecrets([{ path: 'b.js', content: `x="${jwt({ role: 'service_role' })}"` }])).toEqual(['b.js: service_role JWT']);
    expect(findSecrets([{ path: 'c.js', content: 'k="my-exact-secret"' }], { secretValue: 'my-exact-secret' })).toEqual(['c.js: SUPABASE_SECRET_KEY value']);
  });

  it('accepts publishable keys and anon tokens', () => {
    expect(findSecrets([{ path: 'd.js', content: `"sb_publishable_x" "${jwt({ role: 'anon' })}"` }])).toEqual([]);
  });
});
```

`scripts/headers.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('sets the security headers for every path', () => {
  const lines = readFileSync('public/_headers', 'utf8').split('\n').map((l) => l.trim());
  expect(lines[0]).toBe('/*');
  expect(lines).toContain("Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  expect(lines).toContain('X-Content-Type-Options: nosniff');
  expect(lines).toContain('Referrer-Policy: strict-origin-when-cross-origin');
  expect(lines).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=()');
});

it('keeps index.html free of inline scripts', () => {
  const html = readFileSync('index.html', 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [, attributes, body] of scripts) {
    expect(attributes).toMatch(/\bsrc=/);
    expect(body.trim()).toBe('');
  }
});
```

- [ ] **Step 2: Run them to see them fail** — `npx vitest run scripts` → FAIL.

- [ ] **Step 3: Implement** everything in Interfaces.

- [ ] **Step 4: Run**

```bash
npm run check
npm run build -- --mode supabase && npm run check:secrets
npm run test:e2e
```
Expected:
- all checks pass;
- `check:secrets` prints `No secrets found in dist/`;
- the mock e2e suite still passes (the theme script now comes from `/theme-init.js`).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: add security headers, the secrets check, CI and the production runbook"
```

---

### Task 19: Final verification and docs

**Spec:** §2.2 (all success criteria), §10, §11.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-15-phase2-verification.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1: Run every automated check** (stack running and freshly seeded)

```bash
npm run check && npm run test:e2e
npm run db:reset && npm run db:env
npm run test:db && npm run test:integration && npm run test:e2e:supabase
npm run build -- --mode supabase && npm run check:secrets
```
Expected:
- `check`: typecheck, lint, every unit and contract test, and the contrast check are green.
- Mock e2e: `15 passed`.
- pgTAP: every file passes.
- Integration: the assumption, bootstrap, storage, function and both contract suites pass.
- Supabase e2e: `4 passed`.
- `No secrets found in dist/`.

Record the counts in the verification notes.

- [ ] **Step 2: Fill in the owner checklist** in the verification notes — unchecked items, each with a result line:
  1. Add Google's official "G" mark from its sign-in branding resources as `src/assets/third-party/google-g.svg`; confirm the "Continue with Google" button shows it.
  2. Run `docs/runbooks/production.md` end to end (S8).
  3. Google sign-in works for an invited email; an uninvited Google account sees the no-access banner (S4, V1(d)).
  4. On Cloudflare Pages: reloading a deep link works, and the response headers match `public/_headers` (V6).
  5. Invite an address at your university and accept it after the email has sat in the inbox for a while (mail scanners, Review Focus 2).
  6. Before inviting people outside the lab, check the KVKK cross-border transfer requirements with ITU's data-protection contact, and publish a privacy notice.
  7. Check the Supabase plan limits (pausing of inactive projects, backups).

- [ ] **Step 3: Update `README.md`** — add a "Phase 2: Supabase" section:
  - Docker as a prerequisite;
  - the local loop: `npm run db:start`, `npm run db:reset`, `npm run db:env`, `npm run dev:supabase`;
  - the seeded accounts and `localdemo2026`;
  - the env variables from P2 spec §4.2;
  - the test commands;
  - links to the runbook and the verification notes.

- [ ] **Step 4: Update `CLAUDE.md`** — Status: `Phase 2 complete (v0.2.0). Next: Phase 3 — see docs/product/roadmap.md.`

- [ ] **Step 5: Owner review** — ask the owner to go through the checklist items that need production, and fix anything rejected before tagging.

- [ ] **Step 6: Commit and tag**

```bash
git add -A && git commit -m "docs: add phase 2 verification notes and README updates"
git tag v0.2.0
```
