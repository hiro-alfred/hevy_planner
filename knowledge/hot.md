---
title: Hot — session working memory
aliases: [hot, working memory, where we left off]
tags: [meta, session]
type: meta
created: 2026-08-08
updated: 2026-08-15
sources: []
---

# Hot — where we left off

Working memory for **session continuity** ([[schema]]): every new session reads this
page FIRST and resumes from **Next steps**; every wrap-up OVERWRITES it with the
latest state. History belongs in [[log]] — this page holds only the CURRENT state.
Keep the four sections below; they are the template.

## Active task
Nothing in flight. The last round built **`/profile`** ([[standing-profile]]) and
four **animations** ([[ui-design-system]]), then **fixed three bugs the owner
found in the running app within the hour**. The gate, the planner and the sync
path are exactly as previous rounds left them.

**The three fixes, all shipped and redeployed:**

1. **`loading.tsx` blanked two whole pages** — the round's own regression, and
   the important one. `RevealObserver` scanned for `.reveal` once per PATHNAME
   change; with a `loading.tsx` the router commits the FALLBACK first, so the
   pathname changed while the DOM held only skeletons (no `.reveal`), and when
   the real content streamed into the Suspense boundary the layout did not
   re-render, so the scan never ran again. `.reveal` ships at `opacity: 0`, so
   `/routines` and `/profile` showed their chrome and nothing else. The observer
   now also runs a `MutationObserver` over `document.body`. **Neither obvious fix
   works**: dropping the empty-list early return changes nothing (the observer
   and the failsafe both act on the list captured at scan time), and arming the
   failsafe unconditionally fails because `/routines` routinely lands past
   1600 ms. General rule: *a layout-level effect keyed on `usePathname()` does
   not see a route's content — it sees whatever that route commits first.*
2. **"today" for a workout done yesterday.** `relativeDay` counted 24-hour blocks,
   not calendar days: a session at 20:00 read at 10:00 is 14 h old, floors to 0.
   Now local calendar days, ROUNDED so a DST 23/25-hour gap cannot misreport.
3. **Server rendered dates in UTC.** The container had no `TZ`, so it ran 9 hours
   behind the owner and `formatDay`'s `iso.slice(0, 10)` printed UTC's date.
   `TZ` is now on the app service (`${TZ:-UTC}`) and set in `.env`.

**What `/profile` is.** The answers that do not change between plans, saved once
and used to pre-fill every later plan request. `/plans/new` rendered
`<PlanForm />` with **no defaults**, so every new plan re-typed bodyweight,
phase, the four anchor lifts, injuries, emphasis and notes — and re-picked
sessions, length, split, experience and equipment from hardcoded constants. It
adds **no new questions**: every field already existed on the plan form, so the
[[trainee-profile]] governing rule (a field exists only if something consumes it)
is intact, and the consumer is `PlanForm`'s `defaults` prop that the edit flow
already used.

New: `trainee_profile` table (migration **0003**, one JSON document on a
singleton row), `lib/profile-store.ts`, `lib/profile-stats.ts`,
`lib/planner/profile-defaults.ts`, the `src/app/profile/` route, `ui-profile.css`,
and `plans/new/options.ts` (the four fixed-field option lists, extracted so two
forms cannot drift). `PlanForm`'s `defaults` widened to `Partial<PlanRequest>`
and `derivePhase` now takes just the two weights.

Four things from this round worth carrying forward:

- **The animation gap was a missing LOADING state, not a missing effect.** Every
  route is `force-dynamic`, so a prefetch delivers only the static shell and a
  click paints NOTHING until the server finishes — worst on `/routines`, which
  calls Hevy live on every navigation. `loading.tsx` + `.ui-skeleton` is the fix
  — **and adding it is what caused fix 1 above.** The diagnosis was right and the
  remedy introduced a worse bug than the one it cured, because a `loading.tsx`
  changes WHEN a route's content commits, and one client component in the layout
  had quietly depended on the old timing. Adding a loading state to any further
  route is now safe, but check what else keys off `usePathname()` first.
- **A busy button looked identical to an unavailable one.** `:disabled` set
  `opacity: .45` on actions that run for MINUTES. `.ui-btn--working` is 0.75 plus
  a sweeping underline, indeterminate because none of those actions reports
  progress.
- **An animation's empty state must not be the resting value.** The dial's
  resting offset is the truth and the EMPTY state is opt-in behind
  `prefers-reduced-motion: no-preference`. The other way round, a reduced-motion
  reader sees 0% for a 75%-answered profile — a wrong number, not a frozen frame.
- **`Set-Content -Encoding utf8` corrupts a wiki page.** It wrote a BOM and
  mojibake'd every em dash, and the wiki test reported it as "no frontmatter
  block". `git checkout` the file and redo the change with an editor that
  preserves encoding — never a PowerShell rewrite.

Earlier rounds, unchanged: the split sign-in screen, the gate itself
([[app-authentication]]), [[suggested-loads]], the routine browser,
[[exercise-records]], [[workout-history]], [[progressive-overload]],
[[exercise-alternatives]], [[plan-editing]], the Graphite theme.

## State reached
- **REDEPLOYED to :3000** and verified: `/login` 200, `/` `/profile` `/routines`
  307 to the gate, boot log clean, migration 0003 applied (4 migrations,
  `trainee_profile` present), container clock now `Asia/Tokyo`.
- `tsc`, lint, `next build`, **396 vitest tests** (366 before this round; +17 for
  the profile, +13 for `format.test.ts`) and 14 wiki tests all green.
- **The reveal fix is verified on a CLIENT-SIDE navigation**, which is the case
  that was deterministically broken — landing on `/records` and clicking the nav
  link, not a hard load. `/profile` renders in full; on `/routines`,
  `document.querySelectorAll(".reveal")` reports `total=2 hidden=0`.
- **The date fix is verified against the reported case**: a workout stored at
  `2026-08-14T11:00:00Z` (= 20:00 Tokyo, yesterday) now reads **"yesterday"** on
  `/records`. Under the old code it read "today".
- **Screenshotted against a real running server**, since green checks prove
  nothing about a look. `/profile` renders with a 6/8 dial at 75%, the identity
  strip, the full form, the three stat tiles and the muscle-share chips;
  `/plans/new` renders the "Filled in from your saved profile" notice with every
  field pre-filled from the saved row. The busy-button sweep was verified by
  computed style (`::after` running `ui-sweep`, button at 0.75 not 0.45).
- **How the gated preview was screenshotted, since this is reusable.** Standalone
  build staged to a scratch dir on :3005 against a throwaway database in the TEST
  MariaDB (3307), booted with dummy Google credentials, then a scratch script
  minted a session cookie (the same AES-256-GCM seal as `lib/auth/session.ts`,
  keyed on an AUTH_SESSION_SECRET chosen for the preview) and set it over CDP
  before navigating. `AUTH_DISABLED=true` is NOT an option here: the standalone
  `server.js` hardcodes `NODE_ENV=production` on line 5, and the config refuses
  it under production.
- `scripts/seed-demo-history.mjs` filled the preview with 24 templates, 14
  workouts and 42 sets, which is what made the stats real rather than zeroes.
- Still nothing has met a **real Hevy account** — the write path and the workout
  endpoints remain spec-shaped only.

## Open questions / dissents
- **STILL UNCONFIRMED: whether the owner's Google sign-in completes.** Unchanged
  and still the first thing to check on :3000. Use `localhost`, not a LAN IP.
- **`/profile` has never been exercised by a human.** Every screenshot above was
  a server render; the save action, the clear action and the emphasis cap were
  not clicked. There are no component tests in this repo, so the form's
  round trip is proven only by `profile-store.test.ts` at the store level.
- **A stale profile is the hazard this feature introduces.** A bodyweight saved
  months ago feeds [[suggested-loads]] silently, and a plan built on it reaches
  Hevy, which has no DELETE. `/plans/new` says so with a link back; write-back
  from a plan into the profile was deliberately NOT built.
- **`Secure` cookies mean `localhost` only, for now** — unchanged.
- **The image build depends on `fonts.googleapis.com`** — unchanged; the
  permanent fix is `next/font/local`.
- **The boot-migration retry does NOT survive a cold start** — unchanged, and
  migration 0003 now rides on that same hook.
- **BLOCKER, unchanged since 2026-08-08: `.env` `DATABASE_URL` does not work.**
  Only the owner can fix that password. LOCAL-DEV only.
- **`weight_unit` in `settings` is dead** — `getWeightUnit`/`setWeightUnit` have
  zero consumers, and it was deliberately NOT surfaced on the profile page.
  Either wire display conversion or delete the setting.
- **Unproven:** the live Hevy write path, LLM generation, the rep-band equality
  rule, `GET /v1/routines/{routineId}`, `/v1/routine_folders`.
- **`data/` still holds the pre-migration SQLite file with the Hevy key likely in
  PLAINTEXT.** Gitignored, not deleted. Flagged ten times now.
- Hosting undecided (netcup leaning); no backup story — losing `sync_links` is
  the expensive failure.
- `.claude/worktrees/e2e-build` is fully merged and redundant.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget as a Windows service on 3306, but its root
password is unknown — **use the docker test MariaDB on 3307 (root:root)** for
anything scratch. The `mariadb` CLI is at `C:\Program Files\MariaDB 12.3\bin\`,
and Docker's CLI needs `$env:ProgramFiles\Docker\Docker\resources\bin` prepended.
Tests: `npm run test:db:up` then `npm test`.

**Running a gated instance without touching `.env`** (the only way that works —
Next's env loading overrides shell exports):

```
npm run build                                   # emits .next/standalone
cp -r .next/standalone/. <scratch>/ ; cp -r .next/static <scratch>/.next/static
cp -r drizzle <scratch>/drizzle                 # standalone omits migrations
rm <scratch>/.env                               # standalone COPIES .env; drop it
cd <scratch> && DATABASE_URL=… AUTH_SESSION_SECRET=… \
  AUTH_PROVIDER=google GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
  AUTH_ORIGIN=http://localhost:3005 AUTH_ALLOWED_EMAILS=… \
  NODE_ENV=production PORT=3005 node server.js
```

`AUTH_SESSION_SECRET` must decode to **exactly 32 bytes** or the app answers 503
with that reason in the body — `curl -s http://127.0.0.1:3005/login` prints it.
To reach a gated page, mint the session cookie yourself and set it with CDP
`Network.setCookie` (secure: true is fine on localhost); `scripts/cdp-drive.mjs`
does everything except the cookie.

Chrome is `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`; add
`--force-prefers-reduced-motion` or the capture freezes mid-reveal with later
cards at opacity 0. Never trust a capture narrower than 500px. Screenshot paths
must be **Windows** paths.

> [!warning] A mid-reveal capture and a genuinely blank page look IDENTICAL
> Both show chrome with `.reveal` content missing, and this round produced one of
> each — a capture artefact that was harmless, and the real `loading.tsx` bug that
> was not. The flag hides the difference, so it is worth one extra check before
> concluding a page renders fine: evaluate
> `[...document.querySelectorAll(".reveal")].filter(n => !n.classList.contains("is-visible")).length`
> and require **0**. That is what actually proved the fix.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Confirm the owner can sign in with Google end to end** on :3000, then use
   `/profile` for real: save a profile, build a plan from it, clear it. That is
   the round trip nothing has exercised.
2. **Re-check `/routines` with a real Hevy key.** The reveal fix was proven on a
   preview with no key, so the page under test showed 2 reveal elements rather
   than the owner's 12 routine rows. The mechanism is the same, but the owner's
   actual screen is the proof that matters.
3. **THEN: multi-user with OPEN SIGNUP is the agreed direction** — see the
   warning callout in [[app-authentication]] for the measured scope (~49 query
   sites, 9 raw-SQL fragments) and the four traps. `trainee_profile` joins that
   list: it gains a `user_id` unique key with everything else, deliberately NOT
   before. **Until it lands, `AUTH_ALLOWED_EMAILS` must contain the owner's
   address ONLY.**
4. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots.
5. **Sync workout history against the real Hevy account** from `/records` —
   read-only, safe, and it also makes the profile's stats real.
6. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
7. Decide what to do with `data/`, pick the VPS, add a `mysqldump` backup cron.
