---
title: Log — wiki journal
aliases: [log, journal]
tags: [meta, journal]
type: meta
created: 2026-08-08
updated: 2026-08-15
sources: []
---

# Log

Append-only journal of ingests, queries, and lint passes ([[schema]]). Newest entries
at the bottom. When this page nears the 300-line cap, move the oldest entries to
[[log-archive]].
- 2026-08-11 — **Rotated the first 107 log lines into [[log-archive]]** (the whole
  SQLite-era milestone run and its reviews) to get back under the 300-line cap, then
  logged a short console-triage session: two browser errors, one real, one not.
  (1) Reaching the dev server at the machine's LAN address made every `/_next/*`
  request 403 and the HMR socket fail — `next dev` blocks cross-origin access to dev
  resources by default, so the origin needs `allowedDevOrigins` in `next.config.ts`
  ([[deployment]]). Fixed with a segment-wise wildcard and verified by re-requesting
  a dev asset with the LAN `Origin` header: 404 instead of 403. (2) The hydration
  mismatch that followed was **not** a bug: every attribute in React's diff
  (`bis_skin_checked`, `bis_register`, `__processed_<uuid>__`) is injected by
  Bitdefender's extension before hydration, and nothing the app renders differed.
  Recorded as a trap in [[ui-design-system]] together with why
  `suppressHydrationWarning` would be the wrong fix. Worth keeping generally: read
  the mismatch diff for app-owned attributes before treating the warning as a
  server/client bug. Also confirmed the obsidian CLI's `vault=`/`file=` form works
  and filed the first-call-hangs behaviour into [[knowledge-wiki]], where it survives
  the next hot.md overwrite. Wiki tests green.
- 2026-08-11 — **Built [[exercise-alternatives]] and compacted the LLM prompt.** The
  swap feature shipped to its existing design in one pass: `alternatives.ts` (pure —
  ranking, `substitute`, `applySwap`), `excludedExercises` on the request (JSON
  column, no migration), `excludeIds` on `getCandidates`, a rejection rule in
  `validatePlan`, two actions under `withPlanLock` with an `expectedTemplateId`
  guard, and an inline picker island. The design's own known gap — nothing could
  view or clear rejections, so the first accidental swap was permanent — was closed
  in the same pass with a Restore/Clear all list. The one claim worth a test is that
  a swap cannot break the ±20% session-length contract: it holds because `substitute`
  carries `sets` and `restSeconds` over verbatim, and a test now asserts
  `sessionSeconds` is identical across a cross-class swap.
  Separately, generation was made much cheaper by giving the model its OWN schema
  ([[plan-generation]]): sets collapse to a count, exercises are picked by a small
  integer instead of a 36-char UUID, `name` is dropped (it was always overwritten by
  the catalog anyway), and days sharing a candidate pool print it once. Measured
  402 → 53 characters per exercise of output, and a 6-day PPL prompt of 3.0k chars
  against a 20.6k-char candidate block alone before. The integer indirection is also
  a correctness win — an out-of-range index is detectable where a hallucinated UUID
  survived to sync — and unresolvable numbers are now DROPPED and reported rather
  than carried. **Latency was not re-measured: still no `LLM_API_KEY`.** Token counts
  are observed; the wall-clock improvement is an inference from them.
  A Fable 5 subagent reviewed the intake parameter set against the project's own
  "must mechanically change the plan" bar. Nothing was changed — its main
  recommendations (cut `age`, reshape `targetWeightKg` into an asked-for `phase`,
  add a `goalKind` override) overturn recorded decisions in [[trainee-profile]] and
  are the owner's call. It did surface a live bug, verified here: the plan form's
  default goal text "Build muscle and get stronger" hits the STRENGTH regex in
  `classifyGoal` before the hypertrophy one, so an untouched form silently generates
  a 3–6 rep / 180 s strength plan. Lint, `tsc`, 133 vitest tests, 14 wiki tests and
  `next build` all green.
- 2026-08-11 — **Built [[plan-editing]]: editing, forking, and reading the Hevy
  account back.** Three pieces on one owner brief ("see my current plans and edit
  them"). (1) `/routines` walks `GET /v1/routines` — the first READ this app has ever
  done against routines — and labels each one with the plan that owns it, closing
  three blind spots at once: routines made in the Hevy app were invisible, routines
  orphaned by a deleted plan were invisible, and the undocumented routine cap could
  previously only be discovered by a POST 403 landing partway through a sync.
  (2) Per-exercise set/rep/rest editing, completing the minimal-plus scope
  [[plan-pipeline]] closed; the interesting part is what happens to existing sets
  when the count changes, so growing copies the last set's weight ("one more of
  these") and shrinking drops from the end, both tested. (3) Request editing.
  The shape of (3) is the owner's call and worth recording: **editing a request
  FORKS rather than overwriting.** The reason is Hevy, not neatness — a request
  change regenerates every day, and doing that in place would leave the plan's
  existing `sync_links` pointing at real routines, so the next sync would PUT
  entirely different content over routines the user never agreed to lose, with no
  DELETE to undo it. Forking makes that impossible instead of merely warned about.
  The cost is honest and stated in the UI: a fork carries no `sync_links` and no
  folder id, so its first sync CREATES a second set of permanent routines.
  `derived_from_plan_id` has deliberately NO foreign key — a self reference would
  either block deleting an original while a fork survives or cascade into forks that
  are good plans; a dangling id reading as "forked from a plan that no longer
  exists" is the better failure. Fine-grained tweaks stay in place, since forking
  per tweak would leave a dozen near-identical plans after an afternoon on one day;
  an explicit Duplicate covers deliberate forking. Flagged in the wiki as an
  interpretation to revisit.
  Also established that **foreign routines cannot be made editable without
  extending the plan model first**: `planSetSchema` holds only a rep range and
  `to-hevy.ts` hard-codes `reps`, `superset_id`, `duration_seconds`,
  `distance_meters` and `custom_metric` to null, so round-tripping a routine built
  in the Hevy app through a full-replace PUT would silently destroy its fixed rep
  counts, supersets and any duration work. Migration `0001` is additive and
  nullable; a new `migrate.test.ts` walks the real UPGRADE path (migrate to the
  previous version, insert data, migrate forward, assert survival) because every
  other DB test migrates an empty database and would pass a migration that is
  destructive only on populated data. Lint, `tsc`, 144 vitest tests, 14 wiki tests
  and `next build` green; nothing human-verified.
- 2026-08-11 — **Records + progressive overload**, at the owner's request, with the
  feature set designed by a Fable 5 subagent as asked. Two screens on a new local
  cache of logged workouts ([[workout-history]], [[exercise-records]]) plus a
  next-session recommendation ([[progressive-overload]]). Three decisions worth
  keeping: the recommendation is a **deterministic double-progression engine, not
  the LLM** (progression is arithmetic, and there is still no `LLM_API_KEY` to
  verify an LLM path against); `/v1/exercise_history` is **unused** because the
  pinned spec gives it no pagination at all, so `/v1/workouts` + the `events` delta
  feed is the only bounded way to answer "what are my PRs"; and **warm-ups never
  count** — a mistyped warm-up weight is precisely the row that invents a fake PR,
  which the seeded 500 kg set proved. Epley over Brzycki because Brzycki goes
  negative past 36 reps and real history has 20+-rep sets. Migration `0002` is
  additive (two new tables). Unlike every round before it, this one **was actually
  run**: production build against a hand-seeded MariaDB, both pages screenshotted,
  all recommendation branches rendered, unknown id 404s. Lint, `tsc`, **195 vitest
  tests** (up from 144), 14 wiki tests and `next build` green. Still unverified
  against a real Hevy account — every response shape here comes from the spec that
  [[hevy-api]] has already caught lying once.
- 2026-08-11 — **Fed the workout records back into plan generation**
  ([[suggested-loads]]), which was next step 5 in [[hot]]. `rules.ts` still emits
  `weightKg: null`, but the comment justifying it was half false: the app HAS a
  lifting history now. The owner chose "suggest, don't commit" from three options,
  so the plan page shows the load [[progressive-overload]]'s engine computes and it
  becomes a plan weight only on an explicit **Use suggested loads** press — because
  a plan weight syncs to a routine [[hevy-api]] cannot delete. Suggestion runs AFTER
  generation for BOTH generators, so the rules and LLM paths cannot disagree and the
  prompt stays cheap. The trap worth remembering: the engine infers a rep band from
  the log while the plan prescribes one from the request, and 140 kg earned in sets
  of five is a reckless starting weight for sets of twelve — so mismatched
  suggestions are shown, explained, and excluded from the bulk apply. N+1 avoided
  with `getRecentSessions(ids)`: one `inArray` plus `dense_rank()` in SQL, capped at
  the engine's own `PROGRESSION_WINDOW`, so a whole plan costs two queries. Also:
  `weightKg` became editable per exercise (three-state — number, explicit null,
  absent key), and the plan page now DISPLAYS loads at all, which it never did even
  though the LLM path could already set them. **Run, not just built**: seeded MariaDB,
  production build on 3005, a 4-day plan generated in a browser with all six
  recommendation branches visible, 8 of 10 suggestions applied and verified in the
  stored JSON, and the new weight field typed and cleared. `scripts/cdp-drive.mjs`
  gained a `fill:` step (React controlled inputs ignore a plain `.value` assignment);
  `scripts/seed-demo-history.mjs` is new so the next session need not re-invent the
  seed. eslint, tsc, **278 tests** (up from 254) and `next build` green.
- 2026-08-13 — **Closed the app: built [[app-authentication]]**, at the owner's
  request. The app had none — anyone reaching the port could write routines that
  [[hevy-api]] cannot delete. Google OIDC (auth code + PKCE, RS256 id_token
  verified against Google's JWKS, `email_verified` required) against an email
  allowlist, with the **Hevy API key as a fallback gate** after confirming
  against the pinned spec that there is no Hevy OAuth: 14 paths, no token
  endpoint, no `securitySchemes`, an `api-key` header on all 22 authenticated
  operations. That mode is called a shared-secret password gate in the README
  and on the login page, because that is what it is. Apple not started — needs a
  paid developer account, owner to confirm. Zero new dependencies.
  Three things worth remembering. **Next 16 renamed `middleware.ts` to
  `proxy.ts`** and put it on the Node runtime, which is why it can open the
  AES-GCM cookie. **The proxy alone is not a gate for mutations**: Next's own
  docs say a matcher change silently drops Server Function coverage, and actions
  dispatch by an id in a header rather than by path — so all 16 server actions
  call `requireIdentity()` as their FIRST statement, before any try/catch,
  because `redirect()` signals by throwing. **`secret-box.encryptSecret` returns
  PLAINTEXT when unkeyed** — correct for a settings column mid-migration, fatal
  for a session token — so key-required `seal`/`open` primitives were split out
  and given their own `AUTH_SESSION_SECRET`.
  Reversed this project's usual degradation on purpose: a missing auth config is
  a **503 naming the missing variables**, not a quietly open app, since
  "healthy but unprotected" is the same shape as the [[plan-generation]] and
  [[key-handling]] silent failures. `AUTH_DISABLED=true` is the explicit
  escape hatch, refused under `NODE_ENV=production`.
  Verified against a running standalone build with a stand-in Hevy (the real
  account was never touched): logged-out action POST → **401**, no Location;
  logged-out `GET /settings` → 307 to `/login?next=%2Fsettings`; a foreign
  action id at public `/login` did not execute; allowlisted key signed in and
  landed on the remembered page; a non-allowlisted key was refused with one
  generic message and the reason logged server-side only. 361 tests (up from
  278), lint, tsc and `next build` green.
  Not done: nobody has run the Google leg against a real OAuth client — it is
  covered by tests that sign their own tokens with a generated RSA key, which is
  not the same thing. Also rotated the five oldest entries into [[log-archive]].
- 2026-08-13 — **Owner picked Google, and asked for real multi-user accounts.**
  `.env.example` reworked into a Google-only setup (`AUTH_PROVIDER=google`
  pinned, exact Cloud console steps, Hevy-key alternative commented out so it
  cannot be selected by accident); verified both ways against `readAuthConfig` —
  copied unfilled it refuses to serve and names the missing variables, and with
  the four Google values supplied it resolves to mode "google" with the derived
  redirect URI. Then the owner said they want OTHER USERS, and on being asked,
  confirmed they mean **separate accounts per user with open signup**, not a
  shared login. That reverses the single-user premise in
  [[product-architecture]], so [[app-authentication]] gained a warning callout
  rather than being left to read as settled.
  Scoped before agreeing to build anything: **~49 query sites across 10 files**
  plus 9 raw-SQL fragments. The risk is NOT the migration — it is the ownership
  checks. `getPlan(5)` returns plan 5 to whoever asks, and unlike the auth gate a
  missed `WHERE user_id` fails OPEN and silently. Four traps worth keeping:
  `exercise_templates.is_custom` is per-ACCOUNT, so a shared catalog cache would
  leak one user's custom lifts into another's candidate pool and produce plans
  that break at sync; `settings` holds three per-user values globally
  (`hevy_api_key`, `weight_unit`, `workout_sync_cursor`); existing rows need a
  deliberate claiming step, because a user row cannot exist until a first Google
  login supplies the `sub`; and **every user needs their own Hevy Pro
  subscription**, since the pinned spec states the API is Pro-only.
  Sequencing agreed with the owner: prove the Google login end to end FIRST,
  design tenancy separately after. Nothing towards tenancy has been written.
- 2026-08-13 — **Google configured, stack rebuilt, and the login shipped BROKEN
  until the owner actually tried it.** The owner created an OAuth client and
  filled `.env`; `docker compose up -d --build` put the gated image on :3000
  against the real database (migrations `0001`/`0002` applied, boot log clean).
  Verified live: `GET /` and `/settings` → 307 to `/login?next=…`, `/login` →
  200, a server-action POST → 401, and `/api/auth/start` → 307 to Google with
  `response_type=code`, `scope=openid email`, S256, `prompt=select_account` and
  the right `redirect_uri`.
  Then the first real sign-in authenticated and dumped the browser on
  `http://0.0.0.0:3000/` (ERR_ADDRESS_INVALID). **`request.nextUrl` in a ROUTE
  HANDLER is based on the server's BIND address, not the `Host` header**, and
  the Dockerfile binds `HOSTNAME=0.0.0.0`; in the PROXY the same expression
  follows `Host`, which is why the logged-out redirect had been correct all
  along and only the two OAuth legs broke. It survived every pre-deploy check
  because that run bound `127.0.0.1` — a routable address — so a bind-host bug
  is INVISIBLE on loopback. Both legs now emit a relative `Location`;
  `AUTH_ORIGIN` was deliberately not used as a base, since it is the registered
  redirect URI and would break the moment the app is reached by another name.
  Regression test asserts the property, not the old string. 366 tests.
  Two operational facts recorded in [[app-authentication]]: `Secure` session
  cookies are accepted over `http://localhost` but DROPPED over a LAN IP, so
  LAN access needs HTTPS; and the image build depends on `fonts.googleapis.com`
  via `next/font/google`, which failed once on a cold BuildKit and passed on
  retry. Neither is caused by auth.
  Lesson worth keeping: the gate was proven with curl, unit tests and a headless
  browser, and still shipped a bug that only a human clicking Sign in could find
  — because the pre-deploy environment differed from the deployed one in exactly
  one variable nobody thought to vary.
- 2026-08-14 — **Redesigned the login page as a split screen** ([[ui-design-system]]).
  The owner supplied a stock blue "WELCOME BACK" login mockup and asked for that
  composition in the app's own colours. Layout borrowed, palette not: the reference's
  blue wave/grid/dot artwork is redrawn as lime line art at ~10–20% over a near-black
  gradient, so the accent still marks only the primary action. New `ui-login.css`
  plus `login/art.tsx` (the SVG) and `login/shell.tsx` (the frame every branch renders
  through, including the "not configured" dead end). **Every SVG fill, stroke and
  gradient stop is a CSS class, not a presentation attribute** — the no-inline-CSS
  rule has no SVG exemption, and it means the illustration re-tints with
  `--color-ui-accent` instead of pinning a colour the palette will drift from.
  One change outside the page: `SiteHeader` returns `null` on `/login`. The split
  wants the full viewport, and every link in that nav pointed somewhere a
  logged-out visitor cannot go.
  First pass came back **olive**: accent-tinted canvas plus wave fills at 0.85
  opacity stacked into a green block. Fixed by dropping the fills to near-invisible
  and adding a stroked crest line along each curve — at this palette a wave reads as
  a LINE, not as a filled band. Only screenshotting the running app showed it, which
  is the same lesson as the HUD round.
  Verification trap worth keeping: **headless Chrome on Windows will not render a
  viewport narrower than ~500px.** `--window-size=414,896` lays the page out at 500
  and CROPS the image to 414, which looks exactly like horizontal overflow in a
  broken responsive layout. `--headless=old` does it too. Re-shooting at 500 showed
  even margins and no overflow. Logic in `page.tsx` was left alone throughout
  (redirect-if-signed-in, `force-dynamic`, the error-code map, the server-built
  authorize link). `tsc`, lint, `next build`, 366 vitest tests, 14 wiki tests green;
  screenshotted in both auth modes and stacked; `docker compose up -d --build`
  redeployed :3000 (`/login` 200, `/` 307, boot log clean).
- 2026-08-15 — **Built `/profile` ([[standing-profile]]) and four animations
  ([[ui-design-system]])**, asked for together. Three Opus 5 subagents surveyed the
  codebase first: one on motion, one on profile features, one mapping components,
  CSS vocabulary, schema and the action pattern. The motion survey's finding
  reframed the request — the gap was not a missing effect but a missing LOADING
  state, since every route is `force-dynamic` and a click paints nothing until the
  server answers. Shipped: route skeletons, `.ui-btn--working` (a busy button was
  visually identical to an unavailable one, on actions that run for minutes),
  `.ui-notice--result`, and a completeness dial that transitions with zero
  JavaScript by riding `RevealObserver`'s `.is-visible`. The profile page adds **no
  new questions** — it persists the fields the plan form already had, which is what
  keeps the [[trainee-profile]] governing rule intact — and `/plans/new` now
  pre-fills from it with a notice saying so, because a stale bodyweight silently
  feeding [[suggested-loads]] into a routine Hevy cannot delete is the one hazard
  the feature introduces. Cut as fiction after checking for consumers: a kg/lbs
  toggle (`weight_unit` has none), a real avatar (the Google scope is `openid
  email`), a bodyweight chart (no log), streaks and delete-my-account. Migration
  0003 adds `trainee_profile` as one JSON document on a singleton row. `tsc`, lint,
  `next build`, **383** vitest tests and 14 wiki tests green. Screenshotted by
  staging the standalone build on :3005 against a throwaway database and **minting
  a session cookie** to get past the gate — `AUTH_DISABLED` is unavailable there
  because standalone `server.js` hardcodes `NODE_ENV=production`. Not yet
  redeployed to :3000. Trap: `Set-Content -Encoding utf8` corrupted a wiki page
  (BOM plus mojibake'd em dashes) and the lint reported it as missing frontmatter.
- 2026-08-15 — **Three bugs the owner found in the running app within the hour**,
  two of them mine. (1) The round's own `loading.tsx` files **blanked `/routines`
  and `/profile` entirely** — `RevealObserver` scanned for `.reveal` once per
  pathname change, but a route with a loading state commits its FALLBACK first, so
  the scan ran against skeletons carrying no `.reveal` and never ran again when the
  content streamed into the Suspense boundary. `.reveal` ships at `opacity: 0`, so
  the chrome rendered and the content did not — a group header reading "6 routines"
  above black space. A Fable 5 subagent confirmed the mechanism and corrected the
  proposed fix: dropping the empty-list early return changes nothing, because the
  IntersectionObserver and the failsafe both act on the list captured at scan time.
  A `MutationObserver` over `document.body` is what actually fixes it. The general
  rule is worth keeping — **a layout-level effect keyed on `usePathname()` does not
  see a route's content**. (2) `relativeDay` counted 24-hour blocks rather than
  calendar days, printing "today" for a session done at 20:00 the previous evening;
  now local calendar days, ROUNDED so a DST 23/25-hour gap cannot misreport.
  (3) The container had **no `TZ`**, so it rendered every date 9 hours behind the
  owner and `formatDay`'s UTC slice printed the wrong day outright; `TZ` is now on
  the app service defaulting to UTC and set per-owner in `.env`. Verified on a
  CLIENT-SIDE navigation (the deterministically broken case, not a hard load) and
  against a workout stored at 20:00 Tokyo yesterday, which now reads "yesterday".
  396 vitest tests, 14 wiki tests green; redeployed to :3000.
