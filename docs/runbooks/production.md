# Production runbook

How to put the app into production on Supabase Cloud and Cloudflare Pages (P2 spec §10). Work through the checklist in order, then fill in the [Record](#record) section. Keep the project URL, publishable key and secret key in a password manager; the secret key never goes into a `VITE_*` variable, a committed file or Cloudflare Pages.

Replace `<ref>` with the Supabase project ref and `<app origin>` with the app's origin (for example `https://app.example.com`, no trailing slash).

## Checklist

- [ ] **1. Create the Supabase project** in **Frankfurt (eu-central-1)**. Keep the URL, publishable key and secret key in a password manager.
  - If the dashboard offers the cloud equivalent of `[api] auto_expose_new_tables = false` (new tables get no API-role grants automatically), turn automatic API exposure of new tables off, so production matches local. The migrations revoke and grant explicitly either way.
- [ ] **2. Auth.**
  - Disable sign-ups.
  - Site URL = the canonical app URL.
  - Redirect URLs: `{app}/**` for every host the app is served from (the custom domain and, if it's used, the `pages.dev` host).
  - Email link lifetime: 86400 s.
  - Password: minimum 10 characters, letters and digits required.
  - **Google:** in Google Cloud, configure the OAuth consent screen (basic scopes `openid`, `email`, `profile`) and a Web client whose authorized redirect URI is the project's `/auth/v1/callback` URL (`https://<ref>.supabase.co/auth/v1/callback`). Paste its client ID and secret into the Google provider.
- [ ] **3. Email.** Set up custom SMTP with a sender domain that has SPF and DKIM. Paste the templates from `supabase/templates/*.html` and their subjects:
  - Invite (`invite.html`): "You're invited to AppName"
  - Recovery (`recovery.html`): "Reset your AppName password"
- [ ] **4. Database and Edge Function.**

  ```bash
  npx supabase link --project-ref <ref>
  npx supabase db push
  npx supabase functions deploy invitations
  npx supabase secrets set ALLOWED_ORIGINS=<app origin(s)>
  ```

  - Check CORS for the `invitations` function on the hosted project (P2 spec D24). The local stack can't check this: its Kong gateway adds `Access-Control-Allow-Origin: *` to every functions response and answers full preflights itself, so the local integration test only checks the preflight status (204 / 403, sent without `Access-Control-Request-Method`). On the hosted project:

    ```bash
    curl -i -X OPTIONS https://<ref>.supabase.co/functions/v1/invitations \
      -H 'Origin: <app origin>' -H 'Access-Control-Request-Method: POST'
    ```

    The response has `Access-Control-Allow-Origin: <app origin>`.

    ```bash
    curl -i -X OPTIONS https://<ref>.supabase.co/functions/v1/invitations \
      -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'
    ```

    The response has no `Access-Control-Allow-Origin` header.

- [ ] **5. Cloudflare Pages.**
  - Connect the GitHub repository. Build command `npm run build`, output directory `dist`, environment variable `NODE_VERSION=22`.
  - Production variables: `VITE_DATA_SOURCE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_GOOGLE_SIGN_IN=true`.
  - Preview variables: `VITE_DATA_SOURCE=mock`.
  - Pages serves `index.html` for unknown paths when the build has no `404.html`, so no redirect rule is needed.
  - `public/_headers` sets `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. The policy allows no inline scripts, so the theme script is loaded from `/theme-init.js`.
- [ ] **6. GitHub.** Protect `main` so CI must pass before merging (Pages deploys every push to `main`).
- [ ] **7. First owner.** Dashboard → Authentication → Users → Invite user → your email; accept the invitation; create the team workspace; invite the others from the Members dialog.
- [ ] **8. Smoke test.**
  - Invite a second account and accept it.
  - Sign in with Google (an invited email signs in; an uninvited Google account is refused).
  - Create a project with a photo; check that another member sees it and a non-member doesn't.
  - Open a deep link such as `/home` directly and reload (SPA fallback).
  - Check the response headers, for example `curl -I <app origin>/home`, against `public/_headers`.
- [ ] **9. Plan limits.** Check pausing of inactive free projects and the backup policy before inviting pilot users.

## Migration rules

Never edit a migration that has reached production — add a new one. Run `npm run db:reset` and `npm run test:db` before pushing. Regenerate types with `npm run db:types` in the same commit. Production migrations are applied by hand with `npx supabase db push` after merging.

## Data protection

Data stays in the EU region; we store names, emails and work data only. Storing personal data of people in Turkey on EU servers is a cross-border transfer under KVKK, so before inviting people outside the lab, check the requirements with ITU's data-protection contact and publish a privacy notice. This note is not legal advice.

## Record

The owner fills this in after the first deployment and copies V1(d) and V6 into `docs/superpowers/plans/2026-10-15-phase2-verification.md`.

| Check | What | Date | Result |
|---|---|---|---|
| S4 | Google sign-in works for an invited email and is refused for an uninvited one | | |
| V1(d) | Google sign-in with an invited email links to that account and confirms it; an uninvited Google account is refused with `error_code=signup_disabled` | | |
| V6 | Cloudflare Pages serves the SPA fallback and applies `public/_headers` | | |
| S8 | This runbook executed end to end | | |
