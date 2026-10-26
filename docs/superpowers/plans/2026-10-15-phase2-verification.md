# Phase 2 verification notes

| | |
|---|---|
| **Spec** | `docs/superpowers/specs/2026-10-14-phase2-supabase-design.md` (§11 assumptions, §2.2 success criteria) |
| **Plan** | `docs/superpowers/plans/2026-10-15-phase2-supabase.md` (Task 1 checks the assumptions; Task 19 adds the final results and the owner checklist) |
| **Status** | Task 1, 2026-10-18: every assumption checked on the local stack holds, so the design's primary path applies and no §11 fallback is in use. V1(d) and V6 wait for the first deployment; the rest of V2 is checked in Task 13. |

## Environment

Recorded in Task 1 on 2026-10-18.

| | |
|---|---|
| Machine | Windows 11 Pro; Docker Desktop 29.8.2 with the WSL 2 engine |
| Supabase CLI | `npx supabase --version` → `2.121.0` (dev dependency `supabase`) |
| Node | `node -v` → `v24.14.0` (npm 11.9.0) |
| Libraries | `@supabase/supabase-js` 2.118.0, `tsx` 4.23.15 |
| Local stack images | Auth (GoTrue) v2.197.0, Postgres 17.11.0.004, PostgREST v16.4, Kong 2.8.1, Storage v1.82.1, Edge Runtime v1.77.4 |
| Mail catcher | Mailpit v1.31.3 on `http://127.0.0.1:54324` (`GET /api/v1/info` answers 200); its container is still named `supabase_inbucket_<project>` |
| Status key names | `supabase status -o json` lists `ANON_KEY`, `API_URL`, `DB_URL`, `FUNCTIONS_URL`, `GRAPHQL_URL`, `INBUCKET_URL`, `JWT_SECRET`, `MAILPIT_URL`, `MCP_URL`, `PUBLISHABLE_KEY`, `REST_URL`, `S3_PROTOCOL_ACCESS_KEY_ID`, `S3_PROTOCOL_ACCESS_KEY_SECRET`, `S3_PROTOCOL_REGION`, `SECRET_KEY`, `SERVICE_ROLE_KEY`, `STORAGE_S3_URL`, `STUDIO_URL`. `MAILPIT_URL` and `INBUCKET_URL` hold the same URL; the CLI warns on stderr that `INBUCKET_URL` is deprecated and will be removed in v3. |

Notes:

- This CLI version asks about editor settings only with `supabase init --interactive`, so a plain `npx supabase init` wrote `supabase/config.toml` and `supabase/.gitignore` without a prompt.
- The generated `config.toml` has no `[auth.external.google]` or `[auth.email.template.recovery]` section; Task 1 added both with the plan's keys. Every other key from plan Task 1 step 2 exists under the name the plan uses.
- The stack's `vector` container (it ships container logs to the local analytics service) restarts in a loop on this machine: it reads the logs from the Docker daemon at `tcp://192.168.65.254:2375`, which Docker Desktop on Windows opens only with "Expose daemon on tcp://localhost:2375 without TLS". `npm run db:start` still succeeds, and auth, database, API and mail all work; only Studio's log views stay empty. The Docker settings were left unchanged.
- In an agent session `supabase start` prints its status as one JSON line instead of the usual table.
- Mailpit's receive times matched this machine's clock within a few milliseconds, so the `after` filter of `waitForEmail` is reliable here. The WSL 2 clock can drift after the computer sleeps; if `waitForEmail` times out while the email is visible in Mailpit, compare the clocks first.

## V1–V6

Checked by `npm run test:integration` (`integration/assumptions.itest.ts`: 1 file, 7 tests passed in every run on 2026-10-18) against the local stack with the auth settings of P2 spec §5.1 in `supabase/config.toml`.

| # | Assumption | Result | Date |
|---|---|---|---|
| V1(a) | The admin invite works while sign-up is disabled | pass: `inviteUserByEmail` creates an unconfirmed user and sends our invite; a public `signUp` is refused with 422 `signup_disabled` ("Signups not allowed for this instance") | 2026-10-18 |
| V1(b) | Inviting an existing unconfirmed account again sends a fresh link, and the email shows the metadata written just before it | pass: after `updateUserById` writes new metadata, the second invite has a new `token_hash` and reads "Mert Demir invited you to the Beta workspace." | 2026-10-18 |
| V1(c) | Verifying an invite or recovery link confirms the account | pass: `email_confirmed_at` is set after `verifyOtp` with type `invite`, and after type `recovery` on an invited account that was still pending | 2026-10-18 |
| V1(d) | Google sign-in with an invited email links to that account and confirms it; an uninvited Google account is refused with `error_code=signup_disabled` | pending — first deployment | — |
| V1(e) | A reset requested by the app's PKCE client sends a `token_hash` link that `verifyOtp` accepts in another browser | pass: the link's hash has the form `pkce_<hash>`; a client with fresh storage (no code verifier) verifies it and gets a session | 2026-10-18 |
| V2 | Key names in `supabase status` and in the Edge Function environment; how local functions receive `ALLOWED_ORIGINS`; whether `verify_jwt` works with the project's key type | Status key names: pass. `PUBLISHABLE_KEY` (`sb_publishable_…`) and `SECRET_KEY` (`sb_secret_…`) are reported next to the legacy `ANON_KEY` / `SERVICE_ROLE_KEY`, and supabase-js works with both new keys. Function environment, `ALLOWED_ORIGINS` and `verify_jwt` (Task 13): pass, no fallback. The edge runtime receives `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (plus internal `SUPABASE_INTERNAL_PUBLISHABLE_KEY` / `SUPABASE_INTERNAL_SECRET_KEY`), so `index.ts` reads `SUPABASE_SERVICE_ROLE_KEY`. `[edge_runtime.secrets]` in `config.toml` reaches the function as `ALLOWED_ORIGINS`, but only in a container created after the change: `docker start` of the old container keeps its old environment, so the stack was restarted (`npm run db:stop && npm run db:start`). `verify_jwt = true` works: a request without a bearer token gets 401, and a user access token (ES256, the stack also lists an HS256 key) passes the gate. Caveat: the local Kong gateway runs an unconditional `cors` plugin on `/functions/v1/`, so locally every response carries `Access-Control-Allow-Origin: *` and preflights with `Access-Control-Request-Method` are answered by Kong without reaching the function | 2026-10-18, 2026-10-26 |
| V3 | The local mail catcher's address and API | pass: Mailpit at `MAILPIT_URL`; `/api/v1/search` and `/api/v1/message/<ID>` serve the emails to `integration/mailbox.ts` | 2026-10-18 |
| V4 | Password length and character rules are configurable in `config.toml` | pass: with `minimum_password_length = 10` and `password_requirements = "letters_digits"`, `short12` and `onlyletterspassword` fail with `weak_password` (reasons `length` and `characters`) and `letters12345` is accepted | 2026-10-18 |
| V5 | Templates support `{{ .TokenHash }}`, `{{ .Data.* }}` and `{{ if }}`, and `config.toml` can point to template files | pass: with metadata the invite reads "Deniz Kaya invited you to the Site Operations workspace.", without it "You've been invited to join AppName."; both emails use the custom subjects, and their links are built from `site_url` (`http://localhost:5173/accept-invite?token_hash=…&type=invite`, `http://localhost:5173/reset-password?token_hash=…&type=recovery`) | 2026-10-18 |
| V6 | Cloudflare Pages serves the SPA fallback and applies `public/_headers` | pending — first deployment | — |

## Owner checklist

Filled in Task 19.
