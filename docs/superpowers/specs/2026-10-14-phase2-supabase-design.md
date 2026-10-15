# Phase 2 — Supabase Backend — Design Spec

| | |
|---|---|
| **Date** | 2026-10-14 |
| **Status** | Approved by the owner — 2026-10-15 |
| **Plan** | `docs/superpowers/plans/2026-10-15-phase2-supabase.md` |
| **Depends on** | Phase 1 complete (`2026-10-14-home-shell-design.md` and its plan) |
| **Supersedes** | In the Phase 1 spec §9: the auth UI (magic link → password + Google), `VITE_SUPABASE_ANON_KEY` (→ `VITE_SUPABASE_PUBLISHABLE_KEY`), the public `project-covers` bucket (→ private), the roles (`member` → `editor` / `viewer`) and the sign-up bootstrap (now runs when an account is confirmed). §6.5 here lists every schema change; everything else in §9 stands. |
| **Readers** | Claude Code (implementer) and the product owner |
| **Language** | All UI copy, code and docs in English |

---

## 1. Summary

Phase 2 replaces mock persistence with Supabase — Postgres, Auth, Storage and one Edge Function — while every Phase 1 screen keeps working. Access is **invite-only**; people sign in with **email + password** or **Google**. Production runs on **Supabase Cloud in the EU (Frankfurt)**, development on a **local Supabase stack in Docker**, and the frontend ships on **Cloudflare Pages**. Owners manage who can do what through a **Members** dialog with three roles.

---

## 2. Goals, success criteria, non-goals

### 2.1 Goals

1. Real multi-user data, with workspace isolation enforced by the database itself.
2. Invite-only onboarding that works for password and Google users and survives corporate mail scanners.
3. The Supabase adapter behaves exactly like the mock: one contract test suite passes against both.

### 2.2 Success criteria (all must hold)

| # | Criterion | Verified by |
|---|---|---|
| S1 | The repository and auth contract suites pass against the mock and the Supabase adapters | `npm test` (mock) and `npm run test:integration` (local stack) |
| S2 | Isolation: a non-member reads zero rows from every table, view and bucket; a viewer can't write; an editor can't manage members; an owner can | pgTAP suite (`npm run test:db`) |
| S3 | Invite flow: an owner invites an email → the invitee opens the link, sets name and password → lands on Home and sees the team workspace | Playwright against the local stack, reading the invite from the local mail catcher |
| S4 | Google sign-in works for an invited email and is refused for an uninvited one | Manual check on production (OAuth can't run in CI), recorded in the runbook |
| S5 | No secret key in the browser bundle | `npm run check:secrets` scans `dist/` |
| S6 | Switching `VITE_DATA_SOURCE` between `mock` and `supabase` changes no component; the Phase 1 lint rule still holds | ESLint + both e2e suites |
| S7 | `npm run check`, `npm run test:e2e`, `npm run test:e2e:supabase`, `npm run test:integration`, `npm run test:db` pass and the generated database types are current, locally and in CI | GitHub Actions |
| S8 | Production runbook executed end to end | `docs/runbooks/production.md` checklist |

### 2.3 Non-goals

Realtime updates; comments; project or schedule share links and the sharing UI (P7); billing (the subscription stays a trial row); creating tasks (seed data only); a profile settings page (`/settings/profile` stays a placeholder); email notices when someone is added to a workspace; Turkish UI; multi-factor auth; Microsoft sign-in (can be added later as another OAuth provider); schedule data (P3–P4); deleting workspaces or accounts from the UI.

---

## 3. Architecture

```
Browser — React app on Cloudflare Pages
  components → hooks → DataRepository / AuthService
                         └─ SupabaseRepository / SupabaseAuthService   (supabase-js, publishable key, user session)
                               ├─ PostgREST  → tables and security-invoker views, all under RLS
                               ├─ RPC        → Postgres functions for atomic multi-row writes
                               ├─ Storage    → private buckets project-covers, schedule-imports (RLS on storage.objects)
                               └─ Functions  → invitations (verifies the caller, then uses the secret key for admin calls)
Supabase Auth — email + password, Google; public sign-up disabled
  triggers on auth.users → bootstrap each account when it is confirmed (profile, personal workspace, trial, accepted invitations)
```

| # | Decision | Reason |
|---|---|---|
| D1 | Supabase-native approach: supabase-js + RLS + Postgres functions + one Edge Function (owner-approved) | Least code; the database enforces access |
| D2 | Public sign-up disabled; invitations go through the `invitations` Edge Function, which calls the admin invite API | Works for password and Google users on every plan; no auth hook needed |
| D3 | Atomic multi-row writes are Postgres functions; single-row reads and writes go straight through PostgREST under RLS | Atomic where it matters, simple elsewhere |
| D4 | Privileged helpers live in a private schema `app` that the API doesn't expose | Security-definer code is never callable directly |
| D5 | Private storage buckets; the adapter signs URLs (1 hour) in one batch per list and reuses them while they're valid | Project photos are member-only data; stable URLs keep the browser cache warm |
| D6 | Repository and auth contract suites run against both adapters | Guarantees the swap is invisible to the UI |
| D7 | Roles `owner > editor > viewer` (the Phase 1 draft's `member` is replaced) | Matches the members UI |
| D8 | Phase 1 code stays as approved; P2 migrates `AuthService` to v2 in one task | Phase 1 stays stable and shippable |
| D9 | Cloudflare Pages: production builds use Supabase; preview deployments run in mock mode | Previews never touch production data and need no OAuth setup |
| D10 | supabase-js stores its session through `src/lib/storage.ts` | Keeps the Phase 1 "one storage helper" rule |
| D11 | Email links carry a one-time token (`token_hash`) that the app verifies **only when the person submits the form** | Mail scanners that open links can't use them up; works in any browser (no PKCE verifier needed); no navigation from `AuthProvider` |
| D12 | Accounts are bootstrapped when they're **confirmed**, not when the auth row is created | An admin invite creates the auth user immediately; memberships must wait until the person accepts |
| D13 | Revoking the last pending invitation of a never-activated account deletes that account | The old link stops working, so invite-only stays true |
| D14 | `detectSessionInUrl: false`; the `/auth/callback` page finishes the Google sign-in explicitly | Predictable errors and no double exchange under React StrictMode |
| D15 | Signing out ends the session on this device only (`scope: 'local'`) | Signing out of the laptop shouldn't sign you out of your phone |
| D16 | The first production owner is invited from the Supabase dashboard | No script needs the secret key on a laptop |

---

## 4. Environments, configuration and repository layout

### 4.1 Environments

| Environment | Supabase | Frontend | Data |
|---|---|---|---|
| Local | `npm run db:start` (Docker) | `npm run dev:supabase` (Vite mode `supabase`) — `npm run dev` stays on mock | `npm run db:reset` = migrations + `scripts/seed-local.ts`, mirroring the mock `default` scenario |
| CI | `supabase start` on the GitHub runner | built and tested, not deployed | seed script |
| Production | Supabase Cloud, region `eu-central-1` (Frankfurt) | Cloudflare Pages, `main` branch | real |
| Preview | — (mock mode) | Cloudflare Pages preview deployments | mock seed |

### 4.2 Configuration

| Variable | Where | Value |
|---|---|---|
| `VITE_DATA_SOURCE` | frontend | `mock` (default, previews) or `supabase` |
| `VITE_SUPABASE_URL` | frontend | project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | publishable key (`sb_publishable_…`); a legacy anon key also works |
| `VITE_GOOGLE_SIGN_IN` | frontend | `true` shows "Continue with Google" in Supabase mode (unset locally unless Google is configured); mock mode always shows it |
| `VITE_MOCK_TEAM_ROLE` | frontend, mock only | `owner` (default), `editor` or `viewer` — the demo user's role in "Site Operations", to preview each role |
| `ALLOWED_ORIGINS` | Edge Function secret | comma-separated origins for CORS; local default `http://localhost:5173,http://localhost:4174` |
| secret key | Edge Function environment and local scripts only | the project's secret key (or legacy service-role key) — never in a `VITE_*` variable, never committed |

- Vite modes: `.env.supabase` (committed: `VITE_DATA_SOURCE=supabase`) plus `.env.supabase.local` (git-ignored, written by `npm run db:env` from `supabase status`, holding the local URL and publishable key). Production values live in Cloudflare Pages settings.
- `createDataLayer()` reads the Supabase values only when the source is `supabase` and throws `Missing VITE_SUPABASE_URL` or `Missing VITE_SUPABASE_PUBLISHABLE_KEY` (shown by the Phase 1 `StartupError`).
- The app builds OAuth redirect URLs from `window.location.origin`, so no app-URL variable exists.

### 4.3 Repository additions

```
supabase/
├── config.toml                         # supabase init + local auth settings (§5.1)
├── migrations/
│   ├── <ts>_core_schema.sql            # tables, constraints, indexes, grants (§6.5, §6.7)
│   ├── <ts>_app_helpers.sql            # schema app: RLS helpers, triggers' functions (§6.6)
│   ├── <ts>_rls.sql                    # policies (§7)
│   ├── <ts>_views_and_rpc.sql          # views + public functions (§6.5, §6.6)
│   ├── <ts>_storage.sql                # buckets + storage policies (§7.3)
│   ├── <ts>_auth_bootstrap.sql         # triggers on auth.users (§5.6)
│   └── <ts>_invitations.sql            # account_by_email, save_invitation (§6.6)
├── templates/
│   ├── invite.html                     # email templates (§5.2), also pasted into production
│   └── recovery.html
├── functions/invitations/
│   ├── index.ts                        # Deno entry: CORS, auth, data access, admin calls
│   ├── logic.ts                        # pure decision logic, no imports (§5.7)
│   └── logic.test.ts                   # runs in Vitest
├── tests/                              # pgTAP files + _helpers.psql (shared helpers, included with \ir)
└── seed.sql                            # empty (auth users come from scripts/seed-local.ts)
scripts/
├── seed-local.ts                       # admin API: users + data mirroring the mock default scenario
├── write-local-env.ts                  # db:env — writes .env.supabase.local from `supabase status -o json`
└── check-secrets.mjs                   # fails if dist/ contains a secret key (§9)
integration/                            # Node-side code that needs the local stack (own TypeScript settings)
├── local-stack.ts                      # reads URL and keys from `supabase status`
├── mailbox.ts                          # reads emails from the local mail catcher
├── seed-loader.ts                      # loads the mock seed into Supabase (seed-local and fixtures)
├── supabase-fixture.ts                 # contract fixtures for the Supabase adapters
└── *.itest.ts                          # integration tests (npm run test:integration)
src/data/supabase/
├── client.ts                           # createSupabaseClient(config) with the storage adapter
├── database.types.ts                   # generated by db:types
├── mappers.ts                          # row ↔ domain type mapping
├── errors.ts                           # toRepositoryError(error)
├── signed-urls.ts                      # batch signing + reuse cache
├── SupabaseRepository.ts
└── SupabaseAuthService.ts
src/data/sort.ts                        # shared comparators so both adapters order lists identically
src/test/contract/
├── repository.contract.ts              # runRepositoryContract(label, makeFixture)
├── auth.contract.ts                    # runAuthContract(label, makeFixture)
└── mock.contract.test.ts               # runs in npm test (the Supabase runs live in integration/)
src/lib/image.ts                        # prepareCoverImage(file) (§8.3)
src/pages/  ForgotPasswordPage.tsx · ResetPasswordPage.tsx · AcceptInvitePage.tsx · AuthCallbackPage.tsx
src/features/workspaces/  WorkspaceMembersDialog.tsx · member-schema.ts · roles.ts
src/features/profile/CompleteProfileDialog.tsx   # asks for a missing name (§5.6)
src/components/common/GoogleMark.tsx    # renders the owner-supplied Google mark when present (§5.5)
public/theme-init.js                    # Phase 1's inline theme script, moved out for the CSP (§10)
e2e-supabase/                           # Playwright specs for the local stack
playwright.supabase.config.ts           # builds mode `supabase`, serves on 4174
public/_headers                         # security headers on Cloudflare Pages (§10)
.github/workflows/ci.yml
docs/runbooks/production.md
vitest.integration.config.ts
```

The contract suites live under `src/test/` because only that folder (and `src/data/index.ts`) may import adapters inside `src/`; `integration/` sits outside `src/`, uses Node APIs and runs them against the local stack.

### 4.4 npm scripts

| Script | Command |
|---|---|
| `db:start` / `db:stop` | `supabase start` / `supabase stop` (CLI installed as the `supabase` dev dependency) |
| `db:reset` | `supabase db reset && tsx scripts/seed-local.ts` |
| `db:env` | `tsx scripts/write-local-env.ts` |
| `db:types` | `supabase gen types typescript --local > src/data/supabase/database.types.ts` |
| `dev:supabase` | `vite --mode supabase` |
| `test:db` | `supabase test db` |
| `test:integration` | `vitest run -c vitest.integration.config.ts` |
| `test:e2e:supabase` | `playwright test -c playwright.supabase.config.ts` |
| `check:secrets` | `node scripts/check-secrets.mjs` |

Prerequisite added for P2: Docker Desktop (or another Docker engine) running.

---

## 5. Authentication and access

### 5.1 Auth settings

| Setting | Value |
|---|---|
| Public sign-up | **disabled** (local: `enable_signup = false` in `config.toml`; production: dashboard) |
| Providers | Email (password) and Google |
| Password policy | at least 10 characters; letters and digits required |
| Email link lifetime | 24 hours (`otp_expiry = 86400`, the maximum) — invitations need it; it applies to reset links too |
| Site URL | the canonical app URL (local `http://localhost:5173`); email templates build their links from it |
| Allowed redirect URLs | `{app}/**` for every host the app is served from (Google only; the `**` also covers the `?next=` query). Local: `http://localhost:5173/**`, `http://localhost:4174/**`; production: the custom domain and, if it's used, the `pages.dev` host |
| Client options | `flowType: 'pkce'`, `detectSessionInUrl: false`, `autoRefreshToken: true`, `persistSession: true`, `storage`: the `src/lib/storage.ts` adapter |
| Email delivery | custom SMTP in production (the built-in sender is for testing only and heavily restricted); local uses the stack's mail catcher |

### 5.2 Email links

Templates live in `supabase/templates/` (plain HTML, system fonts, one brand-colored link button, no images) and use `{{ .SiteURL }}`, `{{ .TokenHash }}` and the invite metadata in `{{ .Data }}`. The product name from `src/config/brand.ts` is written into them literally; renaming the product means editing them.

| Template | Subject | Body | Button → link |
|---|---|---|---|
| Invite | "You're invited to {AppName}" | With metadata: "{inviter_name} invited you to the {workspace_name} workspace." Without (dashboard invite): "You've been invited to join {AppName}." Then: "Accept the invitation to set up your account. The link works for 24 hours." | "Accept invitation" → `{{ .SiteURL }}/accept-invite?token_hash={{ .TokenHash }}&type=invite` |
| Recovery | "Reset your {AppName} password" | "Use the button below to choose a new password. The link works for 24 hours. If you didn't ask for this, you can ignore this email." | "Choose a new password" → `{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery` |

Opening a link never verifies it. The page verifies the token only when the form is submitted (D11). If a later step fails after verification succeeded, a retry skips the verification (the token is already used).

### 5.3 `AuthService` v2 (replaces the Phase 1 interface)

```ts
export interface Session {
  userId: ID;
}

export type EmailLinkType = 'invite' | 'recovery';

export interface AuthService {
  getSession(): Promise<Session | null>;
  /** Rejects RepositoryError('unauthorized', 'Wrong email or password') for bad credentials. */
  signInWithPassword(email: string, password: string): Promise<void>;
  /** Supabase: leaves the app for Google and returns to /auth/callback (?next=<path> when given). Mock: signs in immediately. */
  signInWithGoogle(next: string | null): Promise<void>;
  /** Supabase: finishes the Google redirect described by `url`. Mock: resolves. See §5.5 for the error copy. */
  completeOAuthSignIn(url: string): Promise<void>;
  /** Resolves whether or not the account exists (no account enumeration); rejects only with 'network' or 'rate_limited'. */
  requestPasswordReset(email: string): Promise<void>;
  /** Exchanges an email link's one-time token for a session. Rejects RepositoryError('validation', 'This link has expired or was already used.'). */
  verifyEmailLink(tokenHash: string, type: EmailLinkType): Promise<void>;
  /** Needs a session. */
  updatePassword(newPassword: string): Promise<void>;
  /** Ends the session on this device only. */
  signOut(): Promise<void>;
  /** Unchanged from Phase 1. Returns an unsubscribe function. */
  onAuthStateChange(listener: (session: Session | null) => void): () => void;
}
```

- **`MockAuthService` v2:** any email with a non-empty password signs in as the demo user, except the password `wrong-password`, which rejects like bad credentials; `signInWithGoogle` signs in immediately; `completeOAuthSignIn` and `requestPasswordReset` resolve; `verifyEmailLink` signs in as the demo user, and rejects with the expired message for the token `expired` or for a token it has already accepted (it remembers used tokens in memory); `updatePassword` resolves.
- **`SupabaseAuthService`:** the `onAuthStateChange` callback only forwards `{ userId }` or `null` — it never awaits another Supabase call inside the callback (supabase-js holds a lock there). Events `SIGNED_OUT` → `null`; every other event → the session's user.

### 5.4 `AuthProvider` and auth hooks

- `useAuth()` returns `{ status: 'loading' | 'signed-in' | 'signed-out', session, signOut }`. Sign-in actions move to mutation hooks in `src/hooks/useAuthActions.ts`: `useSignInWithPassword`, `useSignInWithGoogle`, `useRequestPasswordReset`, `useAcceptInvite` (verify → update password → `updateProfile`), `useResetPassword` (verify → update password).
- When the signed-in user goes away — sign-out, or a switch to another account by opening someone's invite link in a signed-in browser — `AuthProvider` removes every cached query except the `['auth', …]` keys (`queryClient.removeQueries` with a predicate; mutations are left alone). Signing in from a signed-out state removes nothing, so the `/auth/callback` query survives its own `SIGNED_IN` event.
- `AuthProvider` (outside the router, Phase 1 §4.3) subscribes to the query and mutation caches; while the status is `signed-in`, the first `unauthorized` error signs out and shows the toast "Your session expired. Please sign in again." once. (A wrong password on the sign-in page happens while signed out, so it never triggers this.) `RequireAuth` then redirects to `/sign-in` as before.
- `RequireAuth`, the `/` redirect and the shell routes are unchanged. The five auth routes below render outside `AppShell` and `RequireAuth`; only `/sign-in` redirects signed-in visitors (to `state.from` or `/home`).

### 5.5 Screens (copy is pinned)

All auth screens use the Phase 1 sign-in card (centered, width 380, `BrandLogo` on top). Forms use `noValidate` + zod; fields carry `autocomplete` (`email`, `current-password`, `new-password`, `given-name`, `family-name`); pending buttons show a spinner and the pending label.

| Route | Content | Behavior |
|---|---|---|
| `/sign-in` | Title "Sign in"; description "Sign in with your work email."; fields "Email" and "Password" (icon button "Show password" / "Hide password"); link "Forgot password?" right-aligned beside the Password label; primary "Sign in" / "Signing in…"; divider "or"; secondary "Continue with Google" with `GoogleMark`; muted note "Access is by invitation. Ask a workspace owner to invite you." (mock: "Demo mode: any email and password sign you in.") | Wrong credentials → form alert (`role="alert"`) above the primary button: "Wrong email or password". A banner from `/auth/callback` (via `location.state.authError`) shows at the top of the card: `no-access` → "This Google account has no access yet. Ask a workspace owner to invite you."; `failed` → "Google sign-in didn't work. Please try again." Other errors → `errorMessage()` in the form alert. |
| `/forgot-password` | Title "Reset your password"; description "We'll email you a link to choose a new password."; field "Email"; primary "Send reset link" / "Sending…"; link "Back to sign in" | Success replaces the form with "If an account exists for {email}, a reset link is on its way." and the "Back to sign in" link |
| `/reset-password` | Title "Choose a new password"; fields "New password" (hint "At least 10 characters, with letters and numbers") and "Confirm password"; primary "Save password" / "Saving…" | No `token_hash`, or verification fails → the card shows "This link has expired or was already used." + link "Request a new link" → `/forgot-password`. Success → toast "Password updated" → `/home` |
| `/accept-invite` | Title "Welcome to {AppName}"; text "Set your name and a password to finish setting up your account."; fields "First name", "Last name", "Password" (same hint), "Confirm password"; primary "Create account" / "Creating account…"; when Google sign-in is enabled, a muted line under the button: "Next time you can also continue with Google." | No `token_hash`, or verification fails → "This link has expired or was already used." + "Ask the person who invited you to send a new invitation." + link "Back to sign in". Success → `/home` |
| `/auth/callback` | Spinner with `role="status"` and text "Signing you in…" | `useOAuthCallback()` runs `completeOAuthSignIn(href)` once (a `useQuery` with `retry: false`, `staleTime: Infinity`, whose function returns `true` — TanStack Query v5 rejects `undefined` data; no effect, so StrictMode can't run it twice). Success → when `useAuth().status` is `signed-in`, navigate to `next` if it starts with `/` but not `//`, else `/home`. Error → `/sign-in` with `state.authError` = `no-access` (`forbidden`) or `failed` (anything else) |

Validation copy: email "Enter a valid email address"; sign-in password "Enter your password"; new password "Use at least 10 characters with letters and numbers"; confirm "Passwords don't match"; first / last name trimmed 1–60 characters: "Enter your first name" / "Enter your last name" · "Use 60 characters or fewer".

**Google mark:** Google's sign-in branding guidelines ask for the Google "G" mark on this button. We don't draw or embed it in code. The owner downloads the official mark from Google's sign-in branding resources and saves it as `src/assets/third-party/google-g.svg`. `GoogleMark` loads it with `import.meta.glob` (eager, `?url`), so the app builds with or without the file; without it the button shows text only. This is the only third-party mark allowed in the product.

### 5.6 Account bootstrap

`app.bootstrap_account(p_user_id, p_email, p_meta)` (security definer, `search_path = ''`, idempotent) runs:

- from an `after insert on auth.users` trigger when the new row is already confirmed (seeded or admin-created users), and
- from an `after update of email_confirmed_at on auth.users` trigger when it changes from null to a value (an invite, recovery or Google sign-in confirmed the account).

It does, once per account:

1. Insert `public.profiles` — email lowercased; first / last name from metadata `first_name` / `last_name`, else `given_name` / `family_name`, else `full_name` or `name` split at the first space, else empty strings.
2. Insert the personal workspace "My workspace" (`created_by` = the user) and an `owner` membership.
3. Insert a `trial` subscription ending 14 days later.
4. Accept pending invitations for the email: insert memberships with the invited roles and set `accepted_at`.

Unconfirmed (invited, not yet accepted) accounts therefore have no profile, workspace or membership. A second trigger keeps `profiles.email` in sync when `auth.users.email` changes.

**Missing names.** Someone who joins through Google or confirms through "Forgot password?" may have no name. The Home greeting then falls back to "Hello", member lists show the email, and `AppShell` renders `CompleteProfileDialog` (not through `DialogsProvider`): a `FormDialog` (width `sm`) that is open while the current user's first name is empty and hasn't been dismissed in this page session. Title "Add your name"; description "Your name is shown to people in your workspaces."; fields "First name", "Last name" (§5.5 rules); primary "Save" / "Saving…" → `useUpdateProfile` → toast "Name saved". "Cancel" closes it until the next page load.

### 5.7 Invitations

**Table `workspace_invitations`:** `id`, `workspace_id`, `email` (lowercased), `role`, `invited_by` (nullable), `created_at` (refreshed on resend), `accepted_at`, `revoked_at`; one pending invitation per (`workspace_id`, `email`) through a partial unique index.

**Edge Function `invitations`** — `POST` with the caller's bearer token. It answers `OPTIONS` for CORS (`Access-Control-Allow-Origin` = the request origin when it's in `ALLOWED_ORIGINS`) and verifies the caller itself with `auth.getUser(token)`. Errors return `{ message }` with the status below.

`{ action: 'invite', workspaceId, email, role }`:

| Step | Rule | Response |
|---|---|---|
| 1 | Valid session | 401 "Please sign in again." |
| 2 | Body valid (UUID, email, role) | 400 "Check the email and role." |
| 3 | Caller is an owner of the workspace (an unknown workspace fails here too) | 403 "Only workspace owners can invite people." |
| 4 | Workspace is a team workspace | 400 "Invite people to a team workspace." |
| 5 | Look up the account by email (`public.account_by_email`, §6.6). A confirmed account that is already a member | 409 "{email} is already a member." |
| 6 | A confirmed account → `save_invitation` with its user id inserts the membership and an already-accepted invitation (audit trail) in one transaction | 200 `{ status: 'added' }` |
| 7 | No account, or one that was never confirmed → `save_invitation` without a user id upserts the pending invitation; then the admin invite goes out with metadata `{ inviter_name, workspace_name }`. For an existing unconfirmed account, the function first writes that metadata with `auth.admin.updateUserById` and then re-invites, which sends a fresh link | 200 `{ status: 'invited' }`; mail failure → 502 "We couldn't send the invitation email." in the body — the UI shows the generic error, and the pending invitation stays in the list so the owner can resend |

`{ action: 'revoke', invitationId }`: steps 1–2 as above; the invitation must be pending and the caller an owner of its workspace (403 "Only workspace owners can revoke invitations."); set `revoked_at`; if the email belongs to an unconfirmed account with no other pending invitation, delete that account (D13). → 200 `{ status: 'revoked' }`.

The decision logic (steps 2–7 and the revoke rules) lives in `logic.ts` with **no imports**: validation is hand-written and data access is an injected interface, so Vitest tests it without Deno or the network. `index.ts` wires CORS, the Supabase clients and the admin calls.

**Google path:** an admin invite creates the auth user, so "Continue with Google" with the same email signs into that account and confirms it (automatic identity linking). An uninvited Google account is refused because sign-up is disabled (verified in §11, V1).

**First owner in production:** Supabase dashboard → Authentication → Users → Invite user, then accept the email, create the team workspace in the app and invite everyone else from the Members dialog (D16).

### 5.8 Members UI

Entry point: in the Home `WorkspacesPanel`, each team-workspace row gets an icon button (`UserCog`, aria-label "Members of {name}") **beside** the row's `<button>` — the row becomes a flex container holding both, because a button can't contain another interactive element. Personal rows keep an empty slot of the same width so the counts line up. It calls `openDialog('workspaceMembers', { workspaceId })` (new `DialogKind`).

`WorkspaceMembersDialog` uses the Phase 1 dialog shell (width 640, header close button, no footer) — it isn't a `FormDialog`, because it holds a small form and two lists.

| Part | Content |
|---|---|
| Header | Title "Members of {workspace}"; description for owners "Invite people and choose what they can do.", for others "People who can open this workspace." |
| Invite form (owners only) | "Email" input + "Role" select (Owner · Editor · Viewer, each with its description; default Editor) + primary "Send invite" / "Sending…" → toast "Invitation sent to {email}" or "{email} was added to the workspace"; the email field clears on success |
| "Members" list | initials avatar, full name (the email when the name is empty), email; for owners: a role select and a "Remove" icon button (`UserMinus`, aria-label "Remove {name}") on every row except their own; for others: the role as text. Role change → toast "Role updated". Remove → AlertDialog "Remove {name} from {workspace}?" with description "They lose access to its projects and schedules." and buttons "Cancel" / "Remove" → toast "{name} was removed" |
| "Pending invitations" list (owners only, hidden when empty) | email, role, "Invited {relative time}", buttons "Resend" and "Revoke". "Resend" calls `inviteMember` with the row's email and role (→ toast "Invitation sent to {email}"); the pending row is updated, never duplicated. "Revoke" → toast "Invitation revoked" |
| States | loading: 3 skeleton rows per list; list error: `SectionError`; action errors: `toast.error(errorMessage(error))` — the last-owner message reads "A workspace needs at least one owner." |

Role descriptions: Owner "Manages members and settings" · Editor "Creates and edits projects and schedules" · Viewer "Can view everything but change nothing".

### 5.9 Viewer restrictions in Phase 1 screens

When `currentWorkspace.myRole === 'viewer'` (`canEdit(workspace)` in `src/features/workspaces/roles.ts`):

- The banner buttons "New schedule", "Import schedule" and "New project" get `aria-disabled="true"` — still focusable, clicking does nothing — with the Tooltip "Viewers can't make changes in this workspace" (the same pattern as the disabled sidebar items).
- `CreateProjectCard` and the project switcher's "+ Create new project" item are hidden. With no projects, Recent projects shows an `EmptyState` (`FolderKanban`): title "No projects yet", description "Projects in this workspace will appear here."
- The schedule dialogs keep listing the current workspace's projects (Phase 1 behavior), so they can't be opened for a workspace the viewer can't edit.

RLS enforces the same rules server-side.

---

## 6. Data model

### 6.1 Changes to the Phase 1 types (`src/data/types.ts`)

```ts
export type Role = 'owner' | 'editor' | 'viewer';

export interface WorkspaceSummary extends Workspace {
  projectCount: number;
  myRole: Role;                 // new
}

export interface WorkspaceMember {
  userId: ID;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  joinedAt: ISODateTime;
}

export interface WorkspaceInvitation {
  id: ID;
  workspaceId: ID;
  email: string;
  role: Role;
  invitedAt: ISODateTime;
}

export type InviteResult = { status: 'added' | 'invited' };
```

`RepositoryErrorCode` gains `'forbidden'` and `'rate_limited'`. `errorMessage()` becomes:

| Code | Copy |
|---|---|
| `network` | "Can't reach the server. Check your connection and try again." (unchanged) |
| `conflict`, `validation` | the adapter's message (adapters put only user-facing copy there) |
| `forbidden` | "You don't have permission to do that." |
| `unauthorized` | "Your session expired. Please sign in again." (the sign-in form shows its own message instead) |
| `rate_limited` | "Too many attempts. Wait a minute and try again." |
| `not_found`, `unknown` | "Something went wrong. Please try again." |

### 6.2 `DataRepository` additions

```ts
/** Owners first, then editors, then viewers; by name within a role (shared comparator). */
listMembers(workspaceId: ID): Promise<WorkspaceMember[]>;
/** Pending invitations, newest first; an empty list for non-owners. */
listInvitations(workspaceId: ID): Promise<WorkspaceInvitation[]>;
/** Rejects 'forbidden' (not an owner), 'validation' (personal workspace), 'conflict' (already a member). */
inviteMember(input: { workspaceId: ID; email: string; role: Role }): Promise<InviteResult>;
revokeInvitation(invitationId: ID): Promise<void>;
/** Both reject 'validation' with "A workspace needs at least one owner." when no owner would remain. */
updateMemberRole(input: { workspaceId: ID; userId: ID; role: Role }): Promise<void>;
removeMember(input: { workspaceId: ID; userId: ID }): Promise<void>;
updateProfile(input: { firstName: string; lastName: string }): Promise<User>;
```

Ordering rules shared by both adapters (`src/data/sort.ts`): names compare by `toLowerCase()` in code-point order; team workspaces by name then `createdAt`; any list ordered by a timestamp breaks ties by `id`. The Supabase adapter sorts the small name-ordered lists (workspaces, members) in TypeScript with these comparators; timestamp orders run in SQL.

### 6.3 Hooks and query keys

| Hook | Query key | Notes |
|---|---|---|
| `useWorkspaceMembers(workspaceId)` | `['members', workspaceId]` | |
| `useWorkspaceInvitations(workspaceId)` | `['invitations', workspaceId]` | enabled only for owners |
| `useInviteMember(workspaceId)` | — | invalidates members and invitations of the workspace when it settles (success or error — a failed email still leaves a pending row) |
| `useRevokeInvitation(workspaceId)` | — | invalidates invitations |
| `useUpdateMemberRole(workspaceId)`, `useRemoveMember(workspaceId)` | — | invalidate members and `['workspaces']` (your own role may change) |
| `useUpdateProfile()` | — | invalidates `['me']` and the `['members']` prefix |
| `useOAuthCallback()` | `['auth', 'callback', href]` | `retry: false`, `staleTime: Infinity` |
| `useAcceptInvite()`, `useResetPassword()`, `useSignInWithPassword()`, `useSignInWithGoogle()`, `useRequestPasswordReset()` | — | §5.4; `useAcceptInvite` invalidates `['me']` after `updateProfile` |

All keys come from `src/hooks/query-keys.ts`, as in Phase 1.

### 6.4 Mock adapter changes

- `MockDb.version` becomes `2` (same storage key `mock-db.v1`); version-1 documents reseed. New fields: `teamRole` (the seeded role, so a changed `VITE_MOCK_TEAM_ROLE` reseeds just like a changed scenario), `members` (`workspaceId`, `userId`, `role`, `joinedAt`) and `invitations` (`id`, `workspaceId`, `email`, `role`, `invitedById`, `invitedAt`, `acceptedAt`, `revokedAt`). `listWorkspaces` returns the workspaces the current user is a member of.
- Seed (`default`): My workspace — Deniz Kaya owner. Site Operations — Deniz with `VITE_MOCK_TEAM_ROLE` (default `owner`, joined 30 days before seed), Mert Demir owner (20 days; keeps an owner whatever Deniz's role is), Elif Arslan viewer (10 days); one pending invitation `site.planner@example.com` as Editor, invited by Deniz 2 days before seed. `empty`: Deniz owner of My workspace only. `seed()` gains an options argument `{ teamRole?: Role }`, and `createTestDataLayer` a `teamRole` option.
- The mock enforces the same rules as the database: `createProject`, `createSchedule` and `importSchedule` reject with `forbidden` in a workspace where the user is a viewer; member operations are for owners only, keep at least one owner and work in team workspaces only. `inviteMember`: an existing seed user → member (`added`); otherwise it creates the pending invitation or, on resend, updates the existing one (role, `invitedAt`) → `invited`. `revokeInvitation` sets `revokedAt`.

### 6.5 Schema (refines Phase 1 spec §9)

| Object | Change |
|---|---|
| `workspaces.owner_id` | renamed `created_by`, nullable, `on delete set null` — ownership lives in `workspace_members.role` |
| `workspace_members` | `role check (role in ('owner', 'editor', 'viewer'))`; new `joined_at timestamptz not null default now()` |
| `workspace_invitations` | new (§5.7); partial unique index on (`workspace_id`, `email`) where pending; index on `email` where pending |
| `projects.cover_image_url` | renamed `cover_image_path` (storage path); the adapter returns a signed URL as `coverImageUrl` |
| `subscriptions` | created by the bootstrap; trial 14 days |
| `updated_at` | `before update` trigger on `projects` and `schedules` sets `now()` unless the statement itself changed `updated_at` (lets the seed write historical times) |
| `schedules` | `before insert` trigger copies the project's `status_date` when none is given; the §9 `after insert` trigger still touches the parent project |
| Indexes | `projects (workspace_id, updated_at desc)`, `schedules (project_id)`, `schedule_shares (shared_with, shared_at desc)`, `tasks (assignee_id) where not done`, `workspace_members (user_id)` |
| Views | `workspace_summaries` adds `my_role`; all views `security_invoker = true`; `auth.uid()` written as `(select auth.uid())` |

### 6.6 Functions and triggers

| Function | Security | Purpose |
|---|---|---|
| `app.my_workspace_ids(p_min_role text default 'viewer') returns setof uuid` | definer, stable, `search_path = ''` | workspaces where the caller's role ≥ `p_min_role` |
| `app.my_project_ids(p_min_role text default 'viewer') returns setof uuid` | definer, stable | projects in those workspaces |
| `app.has_role(p_workspace_id uuid, p_min_role text) returns boolean` | definer, stable | role check inside functions (owner 3 · editor 2 · viewer 1) |
| `app.bootstrap_account(p_user_id uuid, p_email text, p_meta jsonb)` | definer | §5.6; called by the `auth.users` triggers |
| `app.on_auth_user_created()`, `app.on_auth_user_confirmed()`, `app.sync_profile_email()`, `app.set_updated_at()`, `app.fill_schedule_status_date()`, `app.touch_project()` | trigger functions, all definer | §5.6, §6.5 |
| `public.create_team_workspace(p_name text) returns public.workspace_summaries` | definer | trims and validates 2–40 characters, inserts the workspace and the owner membership |
| `public.is_project_code_available(p_workspace_id uuid, p_code text) returns boolean` | invoker | `not exists (… lower(code) = lower(trim(p_code)))` — no `LIKE`, so `_` in codes is literal |
| `public.update_member_role(p_workspace_id uuid, p_user_id uuid, p_role text)` | definer | owner check; locks the workspace's member rows (`for update`), then applies the last-owner rule |
| `public.remove_member(p_workspace_id uuid, p_user_id uuid)` | definer | same checks |
| `public.account_by_email(p_email text) returns table (user_id uuid, confirmed boolean)` | definer | Edge Function only (`service_role`) |
| `public.save_invitation(p_workspace_id uuid, p_email text, p_role text, p_invited_by uuid, p_user_id uuid) returns text` | definer | Edge Function only. With `p_user_id`: inserts the membership and an accepted invitation → `'added'`. Without: `insert … on conflict (workspace_id, email) where accepted_at is null and revoked_at is null do update` (role, `invited_by`, `created_at`) → `'pending'`. PostgREST's own upsert can't target a partial unique index, hence the function |

Rules for every function:

- Parameters start with `p_`, so they can never shadow a column (in SQL functions a column with the same name silently wins; in PL/pgSQL the reference is ambiguous).
- Definer functions set `search_path = ''` and schema-qualify every name.
- Trigger functions are definers too: the `auth.users` triggers run as Supabase Auth's own database role, which has no rights on our schemas, and `touch_project` updates `projects.updated_at`, a column users can't update.

Projects and schedules are created with plain inserts under RLS; the triggers above do the rest. Public definer functions read `auth.uid()` themselves and raise `insufficient_privilege` (→ `forbidden`) or `check_violation` **with `hint = 'app'`** and the copy above (→ `validation` with that message). Only messages marked this way reach the UI; other database errors use generic copy.

### 6.7 Grants

- **Start from nothing.** Supabase's defaults give `anon` and `authenticated` every privilege on new tables, views and sequences in `public` and `EXECUTE` on new functions. The first migration revokes all of that from `anon` and `authenticated` (plus `EXECUTE` from `PUBLIC`), and alters the schema's default privileges for `anon` and `authenticated` the same way, so later tables and views start clean. Every grant after that is explicit; `service_role` gets full table privileges.
- **Functions need one more step.** PostgreSQL also gives `PUBLIC` `EXECUTE` on every new function. A per-schema default can't remove that, and a database-wide default revoke would also strip `EXECUTE` from extensions created later (pgTAP stops working). So each migration that creates a function revokes `EXECUTE` on it from `PUBLIC`, `anon` and `authenticated`, then grants what it needs. (Checked on PostgreSQL 16 in a dry run.)
- Locally, `config.toml` sets `[api] auto_expose_new_tables = false`; the runbook turns off the cloud equivalent if the dashboard offers it. The explicit revokes keep the migrations correct either way.
- Policies are written `to authenticated`; `anon` gets nothing.
- Column privileges (table-level `UPDATE` stays revoked, otherwise the column list means nothing): `profiles` update only `first_name`, `last_name`, `avatar_url`; `workspaces` only `name`; `tasks` only `done`; `projects` and `schedules` only user-editable columns (never `id`, `workspace_id`, `project_id`, `created_at`, `updated_at`).
- `EXECUTE`: app RPCs to `authenticated`; `account_by_email` and `save_invitation` to `service_role` only.
- The `app` schema isn't in the API's exposed schemas. `authenticated` gets `USAGE` on it and `EXECUTE` on `my_workspace_ids` / `my_project_ids` only, because policies run with the caller's privileges.
- pgTAP pins all of this: `anon` can execute no function in `public` or `app`; `authenticated` can execute exactly the four RPCs and the two RLS helpers, so a function a migration forgets to revoke fails the test; and the column privileges match this list.

---

## 7. Row-level security

RLS is enabled on every table. Policies compare against the helper sets, e.g. `workspace_id in (select app.my_workspace_ids())`, so the membership lookup runs once per statement instead of once per row.

### 7.1 Tables

| Table | Select | Insert | Update | Delete |
|---|---|---|---|---|
| `profiles` | own row; people who share a workspace with me; people who shared a schedule with me | bootstrap only | own row (granted columns) | — |
| `subscriptions` | own row | bootstrap only | — | — |
| `workspaces` | my workspaces | `create_team_workspace` / bootstrap | owners (`name`) | — |
| `workspace_members` | rows of my workspaces | bootstrap / Edge Function | `update_member_role` | `remove_member` |
| `workspace_invitations` | owners of the workspace | Edge Function | Edge Function | — |
| `projects` | my workspaces, or a project holding a schedule shared with me (so "Shared with me" can name it) | editors+ | editors+ (granted columns) | owners |
| `schedules` | projects in my workspaces, or a share to me | editors+ | editors+ (granted columns) | owners |
| `schedule_shares` | `shared_with` = me or `shared_by` = me | `shared_by` = me and editor+ on the schedule's workspace | — | `shared_by` = me |
| `tasks` | `assignee_id` = me | — (seed only in P2) | `assignee_id` = me (`done` only) | — |

### 7.2 Views

`workspace_summaries`, `project_summaries` and `shared_with_me` are `security_invoker`, so the table policies above apply.

### 7.3 Storage

| Bucket | Object path | Read | Write / delete |
|---|---|---|---|
| `project-covers` (private) | `{workspace_id}/{uuid}.{jpg\|png}` | members of the workspace in the first path segment | editors+ of that workspace |
| `schedule-imports` (private) | `{workspace_id}/{project_id}/{uuid}.{ext}` | same | same |

The path check compares the first segment as text (`… in (select id::text from app.my_workspace_ids() as id)`), so a malformed path is simply denied. Original file names never appear in keys (storage keys reject many characters); imports keep theirs in `schedules.source_file_name`. Limits: covers 5 MB, `image/jpeg` or `image/png`; imports 20 MB, any type. No overwrites (`upsert: false`).

---

## 8. Supabase adapter

### 8.1 Client

`createSupabaseClient({ url, publishableKey })` → `createClient<Database>(url, key, { auth: { flowType: 'pkce', detectSessionInUrl: false, autoRefreshToken: true, persistSession: true, storage } })`, where `storage` wraps `readKey` / `writeKey` / `removeKey` from `src/lib/storage.ts` over `getBrowserStorage() ?? createMemoryStorage()` — with storage blocked, the session lasts for the page's lifetime instead of vanishing on every call (Phase 1 Review Focus 4). One client per data layer; the repository and the auth service share it.

### 8.2 Method mapping

| Method | Implementation |
|---|---|
| `getCurrentUser` | `profiles` where `id` = the session's user, single row |
| `getSubscription` | `subscriptions` single row |
| `listWorkspaces` | `workspace_summaries`, then sorted with the shared comparator (personal first) |
| `createTeamWorkspace` | `rpc('create_team_workspace')` |
| `listProjects` / `listRecentProjects` | `project_summaries` by workspace, `updated_at desc, id`, optional limit; then one batch of signed URLs for the cover paths |
| `isProjectCodeAvailable` | `rpc('is_project_code_available')` |
| `createProject` | prepared cover (§8.3) uploaded to `project-covers/{workspaceId}/{uuid}.{jpg\|png}` (extension from its type), then insert the project; if the insert fails, delete the uploaded object (best effort) |
| `createSchedule` | insert with `source = 'blank'` |
| `importSchedule` | read the project's `workspace_id`, upload to `schedule-imports/{workspaceId}/{projectId}/{uuid}.{ext}`, insert with `source = 'import'`, `source_file_name`, `source_file_path`; on failure delete the object (best effort) |
| `listSharedWithMe` | `shared_with_me`, `shared_at desc, share_id` |
| `listPendingTasks` | `tasks` where `done = false`, `due_date asc nulls last, created_at asc, id` |
| `setTaskDone` | update `tasks.done`, return the row |
| `listMembers` / `listInvitations` | `workspace_members` joined to `profiles`, then the shared comparator; `workspace_invitations` where pending, `created_at desc, id` |
| `inviteMember` / `revokeInvitation` | `functions.invoke('invitations', { body: { action, … } })` |
| `updateMemberRole` / `removeMember` | RPCs |
| `updateProfile` | update the own `profiles` row, return it |

`mappers.ts` converts snake_case rows to the camelCase domain types (nesting `client_*`, `location_*` and attribute columns) and normalizes every timestamp with `new Date(value).toISOString()` (Postgres returns microseconds and `+00:00`). Signed URLs are cached in memory per path and reused until 10 minutes before they expire.

### 8.3 Cover images

`prepareCoverImage(file)` in `src/lib/image.ts` scales the photo so its long edge is at most 1600 px and re-encodes it as JPEG (quality 0.85, white background). It returns the original file when the browser lacks `createImageBitmap` or canvas encoding (e.g. jsdom), or when the result would be larger. `useCreateProject` calls it before the repository, so both adapters store the smaller image. The size math (`fitWithin(width, height, max)`) is unit-tested.

### 8.4 Error mapping (`toRepositoryError`)

| Source | Code — message |
|---|---|
| Postgres `23505` on `projects_workspace_code_uq` | `conflict` — "This ID is already used in this workspace" |
| Postgres `23514` with `hint = 'app'` | `validation` — the raised message |
| Postgres `23514` otherwise | `validation` — "Some values aren't valid. Check the form and try again." |
| Postgres `42501` (RLS or privilege) | `forbidden` |
| PostgREST `PGRST116` (no row) | `not_found` |
| Auth `invalid_credentials` | `unauthorized` — "Wrong email or password" |
| Auth `otp_expired` or any failed link verification | `validation` — "This link has expired or was already used." |
| Auth `weak_password` | `validation` — "Use at least 10 characters with letters and numbers" |
| Auth `same_password` | `validation` — "Choose a different password from your current one." |
| HTTP 429, auth rate-limit codes | `rate_limited` |
| HTTP 401, expired JWT, missing session | `unauthorized` |
| Storage 403 | `forbidden` |
| Storage 413 | `validation` — "This file is too large." |
| Function responses 400 / 401 / 403 / 409 | `validation` / `unauthorized` / `forbidden` / `conflict` with the function's message |
| `signup_disabled` in the OAuth callback | `forbidden` (→ `no-access` banner) |
| `fetch` failure, timeout, retryable auth fetch error | `network` |
| anything else (including function 5xx) | `unknown` |

---

## 9. Testing

| Layer | Tool | Coverage |
|---|---|---|
| Repository contract | Vitest; `runRepositoryContract(label, makeFixture)` in `src/test/contract` | Every `DataRepository` behavior from the Phase 1 mock tests (ordering, limits, conflicts, `updatedAt` bumps, shares, tasks) plus members, invitations, roles and the last-owner rule. Expected values come from the fixture (`fixture.users.current.email`, …), never hard-coded. Mock: `npm test`. Supabase: `npm run test:integration` — each test file creates its own users (unique emails) and data through the admin API from the same `seed()` definition, so files are isolated and can run in parallel; the data stays until `npm run db:reset`. Viewers get `forbidden` from the create methods on both adapters. |
| Auth contract | Vitest; `runAuthContract` | password sign-in success and failure (the fixture exposes `badPassword`: mock `wrong-password`, Supabase any wrong one); reset request for an unknown email resolves; link verification succeeds with `fixture.freshToken()` (Supabase: `generateLink`; mock: a new random token) and fails when the same token is used again or is `expired` |
| Database | pgTAP via `supabase test db` | For each table, view and bucket: a non-member sees 0 rows; a viewer reads but can't write; an editor writes projects and schedules but can't manage members or make themselves owner; an owner manages members; last-owner rule; invitations visible to owners only; `anon` and `authenticated` can't execute the service-only functions; column privileges as in §6.7; bootstrap runs on confirmation, not on insert, and accepts only invitations for its own email; a schedule insert by an editor touches the project; `is_project_code_available` with `_` and mixed case |
| Edge Function | Vitest on `supabase/functions/invitations/logic.ts` | added vs invited; resend to an unconfirmed account; not an owner; personal workspace; already a member; invalid body; revoke deletes only a never-activated account without other pending invitations |
| Adapter units | Vitest | `mappers.ts` round trips and timestamp normalization; `toRepositoryError` table; signed-URL reuse; `fitWithin` |
| Auth UI | Vitest + Testing Library with `MockAuthService` v2 | sign-in alert and banners; forgot / reset / accept-invite flows; **loading a link page never calls `verifyEmailLink` — only submitting does**; a retry after a failed later step skips verification; `next` rejects `//evil.example`; viewer-disabled actions; members dialog for owners and non-owners |
| E2E (mock) | Playwright, `playwright.config.ts` (Phase 1 suite updated for the password field) | unchanged flows plus the members dialog |
| E2E (Supabase) | Playwright, `playwright.supabase.config.ts` on the local stack | password sign-in; data persists across reloads; viewer (Elif) sees disabled actions in Site Operations; invite → mail catcher → the helper extracts `token_hash` and opens `/accept-invite` on the test server → Home shows the team workspace |
| Secrets | `npm run check:secrets` | `dist/` contains no `sb_secret_`, no JWT whose payload has `role: service_role`, and not the exact value of `SUPABASE_SECRET_KEY` when that variable is set |
| CI | GitHub Actions `ci.yml` | job 1: `npm run check`, mock e2e; job 2: `supabase start`, `db:env`, `db:reset`, generated types match `database.types.ts`, `test:db`, `test:integration`, `test:e2e:supabase`, build + `check:secrets` |

**Supabase seed loader** (`scripts/seed-local.ts` and the integration fixture share it): create the users through the admin API as confirmed accounts with their names in the metadata, so the bootstrap gives each one a profile, "My workspace" and a trial; map the seed's personal workspace onto the bootstrapped one; insert the team workspace, memberships, projects, schedules, shares, tasks and the pending invitation; then set each project's `updated_at` back to its seed value (inserting schedules touches it) and Deniz's `trial_ends_at` to the seed's. Local seed accounts (local stack only): `deniz.kaya@example.com`, `mert.demir@example.com`, `elif.arslan@example.com`, all with the password `localdemo2026`.

---

## 10. Production rollout (`docs/runbooks/production.md`)

1. Create the Supabase project in **Frankfurt (eu-central-1)**. Keep the URL, publishable key and secret key in a password manager. If the dashboard offers it, turn off automatic API exposure of new tables (the cloud equivalent of `auto_expose_new_tables = false`).
2. **Auth:** disable sign-ups; Site URL = the canonical app URL; redirect URLs `{app}/**` per app host; email link lifetime 86400 s; password minimum 10 with letters and digits. **Google:** in Google Cloud, configure the OAuth consent screen (basic scopes `openid`, `email`, `profile`) and a Web client whose authorized redirect URI is the project's `/auth/v1/callback` URL; paste its ID and secret into the Google provider.
3. **Email:** custom SMTP with a sender domain that has SPF and DKIM; paste `supabase/templates/*.html` and their subjects.
4. `npx supabase link --project-ref <ref>`, `npx supabase db push`, `npx supabase functions deploy invitations`, `npx supabase secrets set ALLOWED_ORIGINS=<app origin(s)>`.
5. **Cloudflare Pages:** connect the GitHub repo; build `npm run build`, output `dist`, `NODE_VERSION=22`; production variables `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_SIGN_IN=true`; preview variables `VITE_DATA_SOURCE=mock`. Pages serves `index.html` for unknown paths when the build has no `404.html`, so no redirect rule is needed. `public/_headers` sets `Content-Security-Policy` (`default-src 'self'`; `connect-src 'self' https://*.supabase.co wss://*.supabase.co`; `img-src 'self' data: blob: https://*.supabase.co`; `style-src 'self' 'unsafe-inline'`; `font-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. The policy allows no inline scripts, so Phase 1's inline theme script in `index.html` moves to `public/theme-init.js`, loaded with a plain `<script src="/theme-init.js">` in `<head>` (still before first paint).
6. **GitHub:** protect `main` so CI must pass before merging (Pages deploys every push to `main`).
7. **First owner:** dashboard → Authentication → Users → Invite user → your email; accept; create the team workspace; invite the others from the Members dialog.
8. **Smoke test:** invite a second account and accept it; sign in with Google; create a project with a photo; check that another member sees it and a non-member doesn't; open a deep link such as `/home` directly and reload; check the response headers.
9. **Plan limits:** check pausing of inactive free projects and the backup policy before inviting pilot users.

**Migration rules:** never edit a migration that has reached production — add a new one; run `npm run db:reset` and `npm run test:db` before pushing; regenerate types with `npm run db:types` in the same commit; production migrations are applied by hand with `npx supabase db push` after merging.

**Data protection:** data stays in the EU region; we store names, emails and work data only. Storing personal data of people in Turkey on EU servers is a cross-border transfer under KVKK, so before inviting people outside the lab, check the requirements with ITU's data-protection contact and publish a privacy notice. This note is not legal advice.

---

## 11. Verify at execution time

These depend on current Supabase and Cloudflare behavior. P2 Task 1 checks each on the local stack (V1(d) and V6 on the first deployment) and records the result in the plan's verification notes. Each has a fallback that keeps the design intact.

| # | Assumption | Fallback |
|---|---|---|
| V1 | (a) The admin invite works while sign-up is disabled. (b) Inviting an existing unconfirmed account again sends a fresh link, and the email shows the metadata written just before it. (c) Verifying an invite or recovery link confirms the account, so the bootstrap runs. (d) Google sign-in with an invited email links to that account and confirms it; an uninvited Google account is refused with `error_code=signup_disabled`. (e) A password reset requested by the app's PKCE client sends a `token_hash` link that `verifyOtp` accepts in another browser, which has no code verifier. | (a) Enable sign-up and reject uninvited emails with a `before insert` trigger on `auth.users`. (b) Delete the unconfirmed account (it holds no data) and invite again. (c) Move bootstrap steps 1–3 to the insert trigger. (d) Drop the "Next time you can also continue with Google." line and plan a "Link Google account" action; map any callback error that mentions sign-ups to `no-access`. (e) Send reset requests through a second client created with `flowType: 'implicit'` and no session storage; it only sends the email, so the link carries a plain token hash. |
| V2 | Publishable / secret key names in `supabase status` and in the Edge Function environment; how local functions receive `ALLOWED_ORIGINS`; whether the platform's `verify_jwt` gate works with the project's key type | Use the legacy anon / service-role keys under the same variable names; set local secrets in `supabase/functions/.env` (git-ignored); turn `verify_jwt` off — the function verifies the caller itself anyway |
| V3 | The local mail catcher's address and API | The e2e helper reads `auth.users.confirmation_token` for the invited email over the local database connection |
| V4 | Password length and character rules are configurable in `config.toml` | Enforce them in the zod schemas only for local runs |
| V5 | Email templates support `{{ .TokenHash }}`, `{{ .Data.* }}` and `{{ if }}`, and `config.toml` can point to template files | Without metadata support, use the generic invite sentence for every invite |
| V6 | Cloudflare Pages serves the SPA fallback and applies `public/_headers` | Add `public/_redirects` with `/* /index.html 200`; set headers with a Pages middleware function |

---

## 12. Changes to Phase 1 artifacts (P2 Task 1 and the tasks that follow)

- `src/data/auth.ts` (v2), `MockAuthService`, `AuthProvider` (cache clearing on user change, `unauthorized` handling), `useAuth`, new `useAuthActions` hooks.
- `SignInPage` and the four new pages and routes; `.env.example` and `src/vite-env.d.ts` (`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_SIGN_IN`, `VITE_MOCK_TEAM_ROLE`; `VITE_SUPABASE_ANON_KEY` removed); `createDataLayer` (Supabase branch replaces the "not implemented yet" error).
- `RepositoryErrorCode` + `errorMessage`; `DataRepository` additions + mock implementations; `MockDb` v2 and the seed; `createTestDataLayer({ teamRole })`; `src/data/sort.ts`.
- `WorkspaceSummary.myRole`; `DialogKind` `'workspaceMembers'`; `WorkspacesPanel` members button; viewer restrictions (banner, `CreateProjectCard`, Recent projects empty state, project switcher); greeting fallback; `CompleteProfileDialog` in `AppShell`; query keys; `useCreateProject` with `prepareCoverImage`; mock create methods reject viewers.
- `index.html`: the inline theme script moves to `public/theme-init.js` (§10, CSP).
- Vitest `include` adds `supabase/functions/**/*.test.ts` and the TypeScript project includes `supabase/functions/**/logic*.ts`, so `npm run check` covers the function logic; ESLint and `tsc` skip `supabase/functions/**/index.ts` (Deno code).
- `CLAUDE.md`: Phase 2 status and sources of truth, the new commands, the Google-mark exception to the IP rule, and "never put the secret key in a `VITE_*` variable".
- The affected Phase 1 tests and e2e steps (the sign-in form now has a password field).

---

## 13. Decisions log

D1–D16 in §3, plus: invitations are workspace-level only (project-level sharing is P7); trial length 14 days; owners can't change their own role or remove themselves in the UI (another owner can); the "added" path sends no email in P2; email links stay valid for 24 hours; no account-deletion UI (handled on request through the runbook).

Verification pass (2026-10-15, after approval, before execution): the SQL design and the plan's pgTAP tests were run on PostgreSQL 16 with a stand-in for Supabase's roles and schemas. Two clarifications came out of it, neither changing the design: function `EXECUTE` is revoked per function (§6.7), and V1(e) covers PKCE password-reset links (§11).
