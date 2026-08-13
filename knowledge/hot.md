---
title: Hot — session working memory
aliases: [hot, working memory, where we left off]
tags: [meta, session]
type: meta
created: 2026-08-08
updated: 2026-08-13
sources: []
---

# Hot — where we left off

Working memory for **session continuity** ([[schema]]): every new session reads this
page FIRST and resumes from **Next steps**; every wrap-up OVERWRITES it with the
latest state. History belongs in [[log]] — this page holds only the CURRENT state.
Keep the four sections below; they are the template.

## Active task
Nothing in flight. The last round **closed the app behind a login** —
[[app-authentication]], built at the owner's request. Before it, anyone who could
reach the port had full control of a Hevy Pro key and could create routines
[[hevy-api]] has no endpoint to delete.

What shipped: **Google OIDC** (authorization code + PKCE, `id_token` verified
RS256 against Google's JWKS, `email_verified` required) checked against an email
allowlist, plus the **Hevy API key as a fallback gate**. Zero new dependencies.
A GATE ONLY — the app stays single-user, no `users` table, no migration `0003`.

Four things from that round are worth carrying forward:

- **Next 16 renamed `middleware.ts` → `proxy.ts`** and defaults it to the Node
  runtime, which is the only reason it can open the AES-GCM session cookie.
- **The proxy is not a gate for mutations.** Actions dispatch by an id in a
  header, not by path, and Next's own docs warn a matcher change silently drops
  Server Function coverage. All 16 server actions call `requireIdentity()` as
  their FIRST statement — before any try/catch, because `redirect()` throws.
- **`secret-box.encryptSecret` returns PLAINTEXT when unkeyed.** Right for a
  settings column mid-migration, fatal for a session token. Key-required
  `seal`/`open` primitives were split out, with their own `AUTH_SESSION_SECRET`.
- **Hevy has no OAuth** — re-confirmed against `docs/hevy-openapi.json`: 14 paths,
  no token endpoint, no `securitySchemes`, `api-key` header on all 22
  authenticated operations. The key gate is a shared-secret password gate and is
  labelled as one in the README and on the login page.

Earlier rounds, unchanged: [[suggested-loads]], the routine browser and
`/routines/[routineId]`, [[exercise-records]], [[workout-history]],
[[progressive-overload]], the day-aware swap picker ([[exercise-alternatives]]),
[[plan-editing]], the Graphite theme.

## State reached
- **Auth is built AND run**, not merely compiled. Verified against a real
  standalone server on 3005 with a throwaway MariaDB and a stand-in Hevy at
  `HEVY_API_BASE_URL` — **the real Hevy account was never touched**:
  logged-out action `POST` → **401**, no `Location`; logged-out `GET /settings` →
  **307** to `/login?next=%2Fsettings`; a foreign action id aimed at public
  `/login` did **not** execute (scratch `settings` table stayed empty);
  allowlisted key signed in and landed on the remembered `/settings`; a
  non-allowlisted key was refused with one generic message, reason logged
  server-side only; a guarded action ran normally once authenticated.
- **361 vitest tests** (up from 278), lint, `tsc` and `next build` all green.
- Public paths are exactly `/login`, `/api/auth/callback/google`,
  `/api/auth/start`. No blanket `/api` matcher exclusion, on purpose.
- **`.env` gained the new `AUTH_*` keys** (append-only, names that could not
  already exist). `AUTH_SESSION_SECRET` is filled in; **every provider field is
  EMPTY**, so the owner's stack answers 503 until one is chosen. That is the
  designed failure, not a bug — see Next steps 1.
- `docker-compose.yml` now requires `AUTH_SESSION_SECRET` via `:?`, so
  `compose up` fails loudly rather than starting an unprotected container.
- The **running container on :3000 was NOT rebuilt or restarted** — it is still
  the pre-auth image.
- Still nothing has met a **real Hevy account**, and the Google leg has never run
  against a real OAuth client.

## Open questions / dissents
- **The owner must pick a provider**, or the app 503s. Nothing can be decided for
  them: it needs either a Google OAuth client or their real Hevy user id.
- **Unproven: the Google flow end to end.** Its logic is covered by tests that
  generate an RSA keypair, publish it as a JWKS and sign their own tokens — good
  coverage of verification, but NOT proof that a real Google client, consent
  screen and redirect URI are configured correctly.
- **`.env`'s `SETTINGS_ENCRYPTION_KEY` does not decode to 32 bytes** (the boot
  hook rejected it with "got 45" when a scratch server loaded that file). Noticed
  incidentally and NOT investigated — reading `.env` is forbidden. If the live
  container ever restarts it may fail on this. Owner's to check.
- **BLOCKER, unchanged since 2026-08-08: `.env` `DATABASE_URL` does not work.**
  `npm run dev` dies with `Access denied for user 'hevy'@'localhost'`. Only the
  owner can fix that password.
- **Unproven: the live Hevy write path**, still irreversible. First real sync
  must be a 2-day plan.
- **Unproven: LLM generation.** Still no `LLM_API_KEY`.
- **Unproven: the rep-band equality rule** against real training.
- **Unproven: `GET /v1/routines/{routineId}`, `/v1/routine_folders`** and every
  workout-endpoint response shape — spec-shaped only.
- **`data/` still holds the pre-migration SQLite file with the Hevy key likely in
  PLAINTEXT.** Gitignored, not deleted. Flagged eight times now.
- Hosting undecided (netcup leaning); no backup story — losing `sync_links` is
  the expensive failure, because re-sync would create DUPLICATE Hevy routines.
- `.claude/worktrees/e2e-build` is fully merged and redundant.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget as a Windows service; the `mariadb` CLI is not
on PATH (`C:\Program Files\MariaDB 12.3\bin\`), and Docker's CLI needs
`$env:ProgramFiles\Docker\Docker\resources\bin` prepended. **Docker Desktop was
not running at session start** — launch `"$env:ProgramFiles\Docker\Docker\Docker
Desktop.exe"` and wait for `docker info` to succeed. Tests:
`npm run test:db:up` then `npm test` (throwaway MariaDB on 3307).

**Running a gated instance without touching `.env`** (new, and the only way that
works — Next's env loading overrides shell exports, and `.env` here has a
`SETTINGS_ENCRYPTION_KEY` that fails to decode):

```
npm run build                                   # emits .next/standalone
cp -r .next/standalone/. <scratch>/ ; cp -r .next/static <scratch>/.next/static
cp -r drizzle <scratch>/drizzle                 # standalone omits migrations
rm <scratch>/.env                               # standalone COPIES .env; drop it
cd <scratch> && DATABASE_URL=… AUTH_SESSION_SECRET=… \
  AUTH_ALLOWED_HEVY_USER_IDS=… HEVY_API_BASE_URL=http://127.0.0.1:4010 \
  NODE_ENV=production PORT=3005 node server.js
```

A stand-in Hevy serving `/v1/user/info` makes the key gate fully drivable with no
real key. Kill stale servers by port (`Get-NetTCPConnection -LocalPort 3005`) —
two servers bound to 3005 on different interfaces once, and both wrote to the
same log, which read exactly like a config bug that was not there.

Chrome is `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`; add
`--force-prefers-reduced-motion` or the capture freezes mid-reveal. Screenshot
paths must be **Windows** paths. `CDP_SETTLE_MS` overrides the 4 s settle; a
server-action click needs 6–8 s. Clicks match visible-text PREFIX, first match.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Owner chooses an identity provider and fills `.env`.** Until then the app
   answers 503 by design. Google is recommended — the README lists the exact
   Cloud console steps and the five values needed. The fastest alternative is
   `AUTH_ALLOWED_HEVY_USER_IDS` from
   `curl -H "api-key: <key>" https://api.hevyapp.com/v1/user/info`.
   **Or decide in-app auth is not wanted at all** and put Cloudflare Access or
   Tailscale in front instead — same protection, zero code to maintain.
2. **Run the Google leg once for real** and confirm the redirect URI matches.
   This is the only untested part of the round.
3. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the
   real database; migrations `0001` and `0002` apply on that boot. Also check
   `SETTINGS_ENCRYPTION_KEY` decodes to 32 bytes.
4. **Rebuild and restart the compose stack** so :3000 actually runs the gated
   image (`docker compose up -d --build`). It will refuse to start until step 1
   is done — that is the `:?` guard working.
5. **Sync workout history against the real Hevy account** from `/records` —
   read-only, safe, and the first real exercise of the workout endpoints.
6. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
   Apply the suggested loads first so that path is exercised deliberately.
7. Decide what to do with `data/`, pick the VPS, add a `mysqldump` backup cron.
