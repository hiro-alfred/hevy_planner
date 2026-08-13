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
Nothing in flight, but ONE THING IS UNCONFIRMED — see Next steps 1.

The last round **closed the app behind a login and deployed it**
([[app-authentication]]). Before it, anyone who could reach the port had full
control of a Hevy Pro key and could create routines [[hevy-api]] has no endpoint
to delete. **:3000 now serves the gated image**, with **Google** configured and
selected (`AUTH_PROVIDER=google`) and the owner's address as the only allowlist
entry.

What shipped: **Google OIDC** (authorization code + PKCE, `id_token` verified
RS256 against Google's JWKS, `email_verified` required) checked against an email
allowlist, plus the **Hevy API key as a fallback gate**. Zero new dependencies.
A GATE ONLY — no `users` table, no migration `0003`.

**The owner has since asked for real multi-user accounts with OPEN SIGNUP.**
That reverses the single-user premise in [[product-architecture]] and is NOT
built; scope and traps are in [[app-authentication]]'s warning callout.
Sequencing agreed: finish proving Google first, design tenancy separately.

Five things from that round are worth carrying forward:

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
- **`request.nextUrl` is NOT the same in a proxy and a route handler.** In a
  route handler it is built from the server's BIND address; in the proxy it
  follows `Host`. That shipped a broken login (`http://0.0.0.0:3000/`) and is
  invisible on a loopback bind. Build redirects RELATIVE.

Earlier rounds, unchanged: [[suggested-loads]], the routine browser and
`/routines/[routineId]`, [[exercise-records]], [[workout-history]],
[[progressive-overload]], the day-aware swap picker ([[exercise-alternatives]]),
[[plan-editing]], the Graphite theme.

## State reached
- **Auth is built, run, AND DEPLOYED.** `docker compose up -d --build` was run;
  **:3000 now serves the gated image** against the owner's real database.
  Google is configured in `.env` (client id, secret, `AUTH_ORIGIN`,
  `AUTH_ALLOWED_EMAILS` — the owner's address only) with
  `AUTH_PROVIDER=google`.
- **Verified against the live stack on :3000**: `GET /` and `GET /settings` →
  **307** to `/login?next=…`; `GET /login` → 200; a server-action `POST` →
  **401**; `/api/auth/start` → 307 to
  `accounts.google.com/o/oauth2/v2/auth` with `response_type=code`,
  `scope=openid email`, `code_challenge_method=S256`, `prompt=select_account`,
  `redirect_uri=http://localhost:3000/api/auth/callback/google`, and
  state/nonce/challenge each 43 chars; handshake cookie
  `Path=/; Max-Age=600; Secure; HttpOnly; SameSite=lax`.
- **A real bug was found and fixed by the owner actually logging in**: the first
  successful Google sign-in redirected the browser to `http://0.0.0.0:3000/`
  (ERR_ADDRESS_INVALID). `request.nextUrl` in a ROUTE HANDLER is based on the
  **bind address**, not the `Host` header, and the Dockerfile binds
  `HOSTNAME=0.0.0.0`; in the PROXY the same expression follows `Host`, which is
  why only the OAuth legs broke. Invisible on any loopback bind — the
  pre-deploy run used `127.0.0.1`. Both legs now emit a RELATIVE `Location`.
  See the trap callout in [[app-authentication]].
- Earlier, pre-deploy verification against a throwaway DB and a stand-in Hevy
  (**the real Hevy account was never touched**) also showed: a foreign action id
  aimed at public `/login` does not execute; a non-allowlisted identity is
  refused with one generic message, reason logged server-side only.
- **366 vitest tests** (up from 278), lint, `tsc`, `next build` and the wiki
  tests all green.
- Public paths are exactly `/login`, `/api/auth/callback/google`,
  `/api/auth/start`. No blanket `/api` matcher exclusion, on purpose.
- `docker-compose.yml` now requires `AUTH_SESSION_SECRET` via `:?`, so
  `compose up` fails loudly rather than starting an unprotected container.
- Migrations `0001` and `0002` applied to the **real** database on this deploy;
  the boot log was clean.
- Still nothing has met a **real Hevy account** — the write path and the workout
  endpoints remain spec-shaped only.

## Open questions / dissents
- **UNCONFIRMED: whether the owner's sign-in now completes.** The redirect fix is
  deployed and the failure they hit is gone, but nobody has reported a
  successful round trip since. That is the ONE thing to check first next
  session — everything else about Google is now proven live.
- **`Secure` cookies mean `localhost` only, for now.** Sessions carry `Secure`
  under `NODE_ENV=production`; browsers accept that over `http://localhost` but
  DROP it over `http://192.168.x.x`, where a login would succeed and then
  silently bounce back to `/login`. `next.config.ts` still lists
  `allowedDevOrigins: ["192.168.0.*"]`, so LAN access is a real use here and
  currently needs HTTPS (reverse proxy with a cert, or Tailscale).
- **The image build depends on `fonts.googleapis.com`** (`next/font/google` in
  `layout.tsx`). It failed once on a cold BuildKit and passed on retry. Not an
  auth issue; the permanent fix is `next/font/local`.
- **`SETTINGS_ENCRYPTION_KEY` now reads as 44 chars** (consistent with a valid
  32-byte key) where a scratch server had earlier rejected it as "got 45", and
  the container boots clean. Appears resolved; never investigated further,
  because reading `.env` is forbidden.
- **The boot-migration retry does NOT survive a cold start — now PROVEN, and it
  is not an auth bug.** When Docker Desktop launched this session, both
  containers came up together under `restart: unless-stopped`; the app raced the
  database, `runMigrations()` died with `ECONNREFUSED 172.18.0.3:3306` inside the
  instrumentation hook, and :3000 served **500 on every request** until the app
  container was restarted by hand. The compose `depends_on: service_healthy`
  only covers the FIRST `compose up`, not a daemon restart. The retry in
  `src/lib/db/migrate.ts` needs to actually cover connection refusal, or the
  hook needs to not be fatal — otherwise a host reboot leaves the app dead.
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
1. **Confirm the owner can sign in with Google end to end.** Google is
   configured and deployed on :3000, and the `0.0.0.0` redirect that broke the
   first attempt is fixed — but a clean round trip has not been reported.
   Use `localhost`, not a LAN IP (see the `Secure` cookie note above). If it
   fails, `docker logs hevy_planner-app-1` names the reason.
2. **THEN: multi-user with OPEN SIGNUP is the agreed direction** — every
   visitor with a Google account gets their own plans, history and Hevy key.
   NOT built; see the warning callout in [[app-authentication]] for the
   measured scope and the four traps. **Until it lands, `AUTH_ALLOWED_EMAILS`
   must contain the owner's address ONLY** — a second address today is a second
   person with full control of the owner's Hevy key, not a second account.
   Open signup also needs the consent screen Published (Testing caps at 100
   manually-added test users) and raises an abuse question nobody has answered:
   plan generation spends the OWNER's `LLM_API_KEY`.
3. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the
   real database. NOTE this is now only a LOCAL-DEV blocker: the container path
   works, and migrations `0001`/`0002` have already applied to the real database
   through it.
4. **Sync workout history against the real Hevy account** from `/records` —
   read-only, safe, and the first real exercise of the workout endpoints.
5. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
   Apply the suggested loads first so that path is exercised deliberately.
6. Decide what to do with `data/`, pick the VPS, add a `mysqldump` backup cron.
