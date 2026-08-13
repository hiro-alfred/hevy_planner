---
title: Hot — session working memory
aliases: [hot, working memory, where we left off]
tags: [meta, session]
type: meta
created: 2026-08-08
updated: 2026-08-14
sources: []
---

# Hot — where we left off

Working memory for **session continuity** ([[schema]]): every new session reads this
page FIRST and resumes from **Next steps**; every wrap-up OVERWRITES it with the
latest state. History belongs in [[log]] — this page holds only the CURRENT state.
Keep the four sections below; they are the template.

## Active task
Nothing in flight. The last round was **cosmetic only**: the login page was
redesigned as a **split sign-in screen** and the rebuilt image was deployed to
:3000. Everything about the gate itself is exactly as the previous round left it.

The owner supplied a stock blue "WELCOME BACK" login mockup and asked for that
composition in the app's own colours. Layout borrowed, palette not — the
reference's blue wave/grid/dot artwork is redrawn as **lime line art at very low
opacity** over near-black, so the accent still marks only the primary action
([[ui-design-system]]).

What changed: new `src/app/ui-login.css`, `src/app/login/shell.tsx` (the frame
EVERY branch renders through, including the "not configured" dead end) and
`src/app/login/art.tsx` (the SVG plus a drawn Google "G"). `key-form.tsx` got a
pill submit and an accent bar down the field. **`SiteHeader` now returns `null`
on `/login`** — the one change outside the login page, because the split wants
the full viewport and every link in that nav pointed somewhere a logged-out
visitor cannot go. **`page.tsx` logic is untouched**: redirect-if-signed-in,
`force-dynamic`, the fixed error-code map, the server-built authorize link.

Three things from this round worth carrying forward:

- **SVG paint is CSS here, not presentation attributes.** Every fill, stroke,
  opacity and gradient stop is a class in `ui-login.css`. The no-inline-CSS rule
  has no SVG exemption, and it means the artwork re-tints with
  `--color-ui-accent` rather than pinning a hex the palette will drift from.
- **At this palette a wave is a LINE, not a fill.** The first pass tinted the
  canvas with the accent and stacked wave fills to 0.85 — it rendered as an olive
  block, the exact failure Graphite was chosen against. Fills went to near
  invisible and each curve gained a stroked crest. Only a screenshot showed it.
- **Headless Chrome on Windows will not render a viewport under ~500px.**
  `--window-size=414,896` lays out at 500 and CROPS to 414, which looks exactly
  like a broken responsive layout overflowing sideways. `--headless=old` does it
  too. Re-shoot at 500 before believing it.

Earlier rounds, unchanged: the gate itself ([[app-authentication]]),
[[suggested-loads]], the routine browser and `/routines/[routineId]`,
[[exercise-records]], [[workout-history]], [[progressive-overload]], the
day-aware swap picker ([[exercise-alternatives]]), [[plan-editing]], the Graphite
theme.

## State reached
- **Redeployed.** `docker compose up -d --build` rebuilt the image and recreated
  the app container against the real database. `GET /login` → **200** serving the
  new screen, `GET /` → **307** to `/login?next=…`, boot log clean (no migration
  error this time).
- **Screenshotted**, since green checks prove nothing about a look: Google mode
  and Hevy-key mode (with an error notice) at 1440, stacked at 500, and the live
  :3000 page after the deploy.
- `tsc`, lint, `next build`, **366 vitest tests** and 14 wiki tests all green.
  No test covers the login page's markup — there are no component tests in this
  repo, so the screenshots are the only evidence for the redesign.
- Everything the previous round proved about the gate still holds and was not
  re-verified end to end here: Google OIDC (PKCE, RS256 against Google's JWKS,
  `email_verified` required) against an email allowlist, the Hevy key fallback,
  16 server actions calling `requireIdentity()` first, public paths exactly
  `/login`, `/api/auth/callback/google`, `/api/auth/start`.
- Still nothing has met a **real Hevy account** — the write path and the workout
  endpoints remain spec-shaped only.

## Open questions / dissents
- **STILL UNCONFIRMED: whether the owner's Google sign-in completes.** The
  `0.0.0.0` redirect bug is fixed and deployed, but no successful round trip has
  been reported — and this round only changed how the page LOOKS, so it is still
  the first thing to check. Use `localhost`, not a LAN IP (see the `Secure`
  cookie note below).
- **`Secure` cookies mean `localhost` only, for now.** Sessions carry `Secure`
  under `NODE_ENV=production`; browsers accept that over `http://localhost` but
  DROP it over `http://192.168.x.x`, where a login would succeed and then
  silently bounce back to `/login`. `next.config.ts` still lists
  `allowedDevOrigins: ["192.168.0.*"]`, so LAN access is a real use here and
  currently needs HTTPS (reverse proxy with a cert, or Tailscale).
- **The image build depends on `fonts.googleapis.com`** (`next/font/google` in
  `layout.tsx`). It failed once on a cold BuildKit and passed on retry — it built
  fine this round. The permanent fix is `next/font/local`.
- **The boot-migration retry does NOT survive a cold start** (proven 2026-08-13,
  not an auth bug). When Docker Desktop launches, both containers come up
  together under `restart: unless-stopped`, the app races the database,
  `runMigrations()` dies with `ECONNREFUSED` inside the instrumentation hook, and
  :3000 serves **500 on every request** until the app container is restarted by
  hand. `depends_on: service_healthy` only covers the first `compose up`. The
  retry in `src/lib/db/migrate.ts` needs to cover connection refusal, or the hook
  must not be fatal — otherwise a host reboot leaves the app dead.
- **BLOCKER, unchanged since 2026-08-08: `.env` `DATABASE_URL` does not work.**
  `npm run dev` dies with `Access denied for user 'hevy'@'localhost'`. Only the
  owner can fix that password. LOCAL-DEV only — the container path works.
- **Unproven: the live Hevy write path**, still irreversible. First real sync
  must be a 2-day plan.
- **Unproven: LLM generation.** Still no `LLM_API_KEY`.
- **Unproven: the rep-band equality rule** against real training.
- **Unproven: `GET /v1/routines/{routineId}`, `/v1/routine_folders`** and every
  workout-endpoint response shape — spec-shaped only.
- **`data/` still holds the pre-migration SQLite file with the Hevy key likely in
  PLAINTEXT.** Gitignored, not deleted. Flagged nine times now.
- Hosting undecided (netcup leaning); no backup story — losing `sync_links` is
  the expensive failure, because re-sync would create DUPLICATE Hevy routines.
- `.claude/worktrees/e2e-build` is fully merged and redundant.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget as a Windows service; the `mariadb` CLI is not
on PATH (`C:\Program Files\MariaDB 12.3\bin\`), and Docker's CLI needs
`$env:ProgramFiles\Docker\Docker\resources\bin` prepended. Tests:
`npm run test:db:up` then `npm test` (throwaway MariaDB on 3307).

**Running a gated instance without touching `.env`** (the only way that works —
Next's env loading overrides shell exports, and `.env` here has a
`SETTINGS_ENCRYPTION_KEY` that fails to decode):

```
npm run build                                   # emits .next/standalone
cp -r .next/standalone/. <scratch>/ ; cp -r .next/static <scratch>/.next/static
cp -r drizzle <scratch>/drizzle                 # standalone omits migrations
rm <scratch>/.env                               # standalone COPIES .env; drop it
cd <scratch> && DATABASE_URL=… AUTH_SESSION_SECRET=… \
  AUTH_PROVIDER=google GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
  NODE_ENV=production PORT=3005 node server.js
```

Dummy Google credentials are enough to render and screenshot the login page —
nothing is exchanged until the button is clicked. A throwaway database in the
test MariaDB (`CREATE DATABASE login_preview` on 3307) satisfies the boot
migration. Re-staging over a RUNNING standalone server fails with `cannot
overwrite directory … mysql2-…`; stop the server first, or stage to a new port
directory. Kill by port: `Get-NetTCPConnection -LocalPort 3005`.

Chrome is `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`; add
`--force-prefers-reduced-motion` or the capture freezes mid-reveal, and never
trust a capture narrower than 500px (see the crop trap above). Screenshot paths
must be **Windows** paths. `CDP_SETTLE_MS` overrides the 4 s settle; a
server-action click needs 6–8 s. Clicks match visible-text PREFIX, first match.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Confirm the owner can sign in with Google end to end** on :3000 — still the
   one unproven thing about the gate, and now also the way to see the new login
   screen in a real browser. If it fails, `docker logs hevy_planner-app-1` names
   the reason.
2. **THEN: multi-user with OPEN SIGNUP is the agreed direction** — every visitor
   with a Google account gets their own plans, history and Hevy key. NOT built;
   see the warning callout in [[app-authentication]] for the measured scope
   (~49 query sites, 9 raw-SQL fragments) and the four traps. **Until it lands,
   `AUTH_ALLOWED_EMAILS` must contain the owner's address ONLY** — a second
   address today is a second person with full control of the owner's Hevy key.
   Open signup also needs the consent screen Published (Testing caps at 100
   manually-added test users) and raises an abuse question nobody has answered:
   plan generation spends the OWNER's `LLM_API_KEY`.
3. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the
   real database.
4. **Sync workout history against the real Hevy account** from `/records` —
   read-only, safe, and the first real exercise of the workout endpoints.
5. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
   Apply the suggested loads first so that path is exercised deliberately.
6. Decide what to do with `data/`, pick the VPS, add a `mysqldump` backup cron.
