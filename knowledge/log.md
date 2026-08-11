---
title: Log — wiki journal
aliases: [log, journal]
tags: [meta, journal]
type: meta
created: 2026-08-08
updated: 2026-08-11
sources: []
---

# Log

Append-only journal of ingests, queries, and lint passes ([[schema]]). Newest entries
at the bottom. When this page nears the 300-line cap, move the oldest entries to
[[log-archive]].

- 2026-08-08 — **SQLite → MariaDB**, at the owner's request. Merged
  `worktree-e2e-build` into `dev` first (fast-forward, 8 commits) so the
  conversion ran once against the full app rather than twice against diverging
  branches. Rationale, cost, and the full dialect-difference table are in
  [[mariadb-migration]]; the ops cost (second container, tests now need a
  server) was raised before starting and the change confirmed anyway. The trap
  worth remembering: drizzle's mysql `json()` defines no `mapFromDriverValue`
  and MariaDB reports `JSON` as `LONGTEXT`, so every JSON column would have
  returned an unparsed string — silently, failing only at the first property
  access. `src/lib/db/json-column.ts` maps both directions. Four more that a
  config-only swap would have missed: no `RETURNING`, no `json_each`/
  `JSON_OVERLAPS`, `escape '\'` does not parse, and `better-sqlite3`'s
  synchronous transaction had to become async. Migrations squashed to a fresh
  `0000` (no instance held data; the old `0001` dedup only ever repaired SQLite
  files). Also fixed eslint linting a nested worktree's `.next/` output as if it
  were source — 769 phantom errors. Build, lint and generate green; **the
  DB-backed suites are unrun** (no Docker on this machine), so the translated
  SQL was verified by compiling it through drizzle's mysql dialect instead.
- 2026-08-08 — Verified the MariaDB move end to end, and **corrected a claim I
  got wrong**. Installed MariaDB 12.3.2 natively (no Docker on this box; WSL2
  has no distro), created `hevy_planner`, ran the suite against it: **63/63**.
  Boot migration built all four tables plus `__drizzle_migrations` on first
  request; `/`, `/settings`, `/plans/new` all 200 and a missing id 404s, with a
  clean server log. The correction: [[mariadb-migration]] asserted that mysql2
  returns MariaDB JSON columns unparsed, so drizzle's `json()` could not
  round-trip. Half true. The column IS reported as protocol type 252 (LONGTEXT),
  not 245 — but mysql2 3.23.2 parses it regardless, via the extended metadata
  MariaDB 10.5+ sends marking the format as JSON; both text and binary protocols
  returned an object. `json()` would have worked here. `json-column.ts` stays,
  now justified as version-independence (older servers and drivers that ignore
  extended metadata do return the string) rather than as a fix for a live bug.
  Lesson worth keeping: "the protocol type is wrong" did not imply "the driver
  gets it wrong" — the vendor shipped a compatibility path I had not accounted
  for, and only running it showed that. Still untested: the container path.
- 2026-08-08 — First real catalog refresh failed; two spec-vs-reality bugs found
  and fixed. `describeHevyError` showed only "Catalog refresh failed." because
  the underlying error was neither a HevyApiError nor a UserFacingError, so
  diagnosis needed a one-off repro harness. The error was MariaDB
  `ER_NO_DEFAULT_FOR_FIELD` on `equipment_category`: the live API sends
  **`equipment`**, while the pinned spec declares `equipment_category`, so the
  value was `undefined` on all 452 templates, drizzle emitted `DEFAULT`, and the
  NOT NULL column rejected it. Second bug found while diffing live values
  against `constants.ts`: `REP_BASED_TYPES` had been guessed and listed two
  types that do not exist (`bodyweight_reps`, `bodyweight_assisted_reps`) while
  omitting the two that do (`bodyweight_weighted`, `bodyweight_assisted`) — so
  every assisted pull-up and weighted dip was silently excluded from candidate
  lists. Both recorded as traps in [[hevy-api]]. Root cause of both: the stub
  client was written from the spec, so the suite validated the spec rather than
  the API — green tests, broken product. Fixtures now match observed payloads,
  `assertStorable` fails before the transaction naming the missing field, and
  unexpected errors are logged server-side so the next one needs no harness.
  Verified against the live API: 452 cached, all 9 equipment categories, 6
  assisted/weighted lat exercises now candidates where there were 0. 67 tests.
- 2026-08-08 — **Encrypted the Hevy key at rest** (AES-256-GCM,
  `src/lib/secret-box.ts`), reversing the plaintext decision in
  [[plan-pipeline]] at the owner's request. The original reasoning was not
  wrong, it was scoped to a premise that [[mariadb-migration]] removed: with a
  database file on the app's own disk, DB compromise really was a subset of host
  compromise. With MariaDB, dumps and backups travel on their own, so the
  database-only case is real and this is what covers it. Stated the limit in
  code, README and [[key-handling]] rather than overselling: the key lives in
  the app host's environment, so host compromise still yields both halves.
  Hashing was never an option — the credential must be replayed to Hevy, not
  merely verified. Details worth remembering: the setting key is GCM additional
  authenticated data so a ciphertext cannot be moved between rows; a plaintext
  row still reads, and `migrateSecretsToEncrypted()` upgrades it at boot
  preserving `updated_at`; `getHevyKeyStatus` had to decrypt before masking or
  the UI would have shown the last 4 chars of base64; a wrong/rotated key
  reports `undecryptable` rather than "not configured", so the user re-enters
  instead of hunting. Verified on the live box: existing key upgraded in place
  ("encrypted 1 stored secret(s)"), row now `enc:v1:…`, app still works.
  82 tests.
- 2026-08-08 — **LLM provider set to DeepSeek** at the owner's request; default
  `deepseek-v4-pro`, `anthropic` kept wired. Checking the live docs instead of
  trusting recall paid for itself twice. (1) `deepseek-chat` and
  `deepseek-reasoner` were RETIRED on 2026-07-24 — they were routing labels for
  the non-thinking/thinking modes of `deepseek-v4-flash`, not models, and there
  is no redirect. The AI SDK's `DeepSeekChatModelId` type still lists only those
  two, so autocomplete hands you a dead value; `getLlmConfig` now rejects them
  by name and says what to use. (2) `@ai-sdk/deepseek` never sets
  `supportsStructuredOutputs`, so `generateObject` uses `json_object` with the
  schema in a system message rather than strict `json_schema`, and DeepSeek
  documents that mode occasionally returning empty content — tolerable only
  because the existing retry + rule-based fallback already absorbs it. Both
  recorded in [[plan-generation]]. Also: `ProviderOptions` is declared but not
  exported by `ai`; the real type is `SharedV4ProviderOptions` from
  `@ai-sdk/provider`, now a direct dependency since we import from it. 90 tests.
- 2026-08-08 — **Started clearing the container path**: enabled WSL2's two
  Windows features (`Microsoft-Windows-Subsystem-Linux`, `VirtualMachinePlatform`)
  elevated via dism, which returned 3010 — reboot required before a hypervisor
  exists, so Docker itself is still uninstalled. Reading the machine first was
  worth it: `wsl --status` printing usage and ignoring `WSL_UTF8` looks like a
  broken WSL but only means the inbox stub with the feature off, and
  `HypervisorPresent=False` alongside `VirtualizationFirmwareEnabled=True` is
  what said the blocker was Windows features rather than BIOS. Inspecting the
  repo for the same reason found two compose faults the reboot would have run
  straight into, both now fixed in [[deployment]]: the `app` service passed
  `ANTHROPIC_API_KEY`, dead since the provider became configurable, so the
  container would never have seen `LLM_API_KEY` — and because a missing key
  falls back to the rule generator rather than erroring, that reads as a healthy
  stack writing worse plans, the exact confusion [[plan-generation]] warns
  about. Second, the hard-coded `3000:3000` would have failed its bind against
  the node process already on 3000; the host side is now `${APP_PORT:-3000}`.
  Worth keeping: the `app` service has no `env_file:`, so its environment is
  exactly what `environment:` lists — `.env` reaching compose does not mean it
  reaches the container.
- 2026-08-09 — **The container path runs.** Docker Desktop 4.85.0 / engine
  29.6.2 / compose v5.3.1 on WSL 2.7.11; `compose up -d --wait` brings both
  services up healthy, the boot migration builds the whole schema on an empty
  volume, and `/`, `/plans/new`, `/settings` answer 200. 103/103 tests also pass
  against the pinned 11.4 image, closing the 12.3-vs-11.4 worry. The lesson is
  the one failure: `docker compose build` died on `COPY /app/public` because
  there is no `public/` — the favicon is App Router metadata under `src/app/` —
  and COPY errors on a missing source rather than skipping it. Every prior
  reading of that Dockerfile, including the [[deployment]] page describing the
  runtime stage, listed `public` as if it existed; nothing but running the build
  was going to catch it. Also worth keeping: the boot migration logs nothing on
  success, so `SHOW TABLES` is the evidence it ran, and the retry path in
  `src/lib/db/migrate.ts` is still unfired because `depends_on` never lets the
  app meet a database that is not already up.
- 2026-08-08 — **Revamped the UI into a neon-HUD theme** ([[ui-design-system]]):
  new CSS layer plus six motion components, every page restyled, dark-only by
  decision rather than by omission. Green checks proved nothing about the look —
  lint, types, 90 tests and the build all passed while a hover-sweep highlight
  sat permanently visible on every button and one button stretched full-width.
  Both were found only by screenshotting the running app, which is now the
  standard for UI work. Two infrastructure findings worth keeping. (1) Turbopack
  caches a FAILED `@import` resolution: creating `globals.css` before the
  `hud.css` it imports left `Can't resolve './hud.css'` surviving a dev-server
  restart while `next build` succeeded from the same source — clearing `.next`
  is the fix, and it is the rare case that needs it. (2) A latent `.env`
  breakage surfaced: a fresh boot dies with `Access denied for user 'hevy'`,
  though the database and credentials are fine. Next reloads `.env` without
  re-running `instrumentation.ts`, so the old long-lived server kept a working
  connection while the file drifted — an app that "still works" is not evidence
  its config is valid. Recorded as the blocker in [[hot]].
- 2026-08-08 — **Added the optional trainee profile** ([[trainee-profile]]) and
  **the LLM path finally ran for real**. A Fable subagent designed the field
  set; its sharpest move was reading the existing system prompt ("Leave
  weightKg null — you do not know the trainee's current loads") and choosing
  the fields that delete that sentence, rather than the body metrics that were
  asked for. It rejected **height** on the grounds that nothing in the pipeline
  or in coaching practice consumes it; the owner accepted. Verified on real
  generations, not unit tests: an injury produced zero overhead pressing across
  21 exercises, anchors produced populated weights where their absence produced
  nulls, and a target weight produced a "Cut" plan without the number ever
  reaching the model. The bug of the session was invisible to every check —
  `min={1} step={2.5}` on a number input makes 120 a `stepMismatch`, and a form
  that fails constraint validation **does not submit and displays nothing**;
  lint, types, 103 tests and the build were all green over a form that could
  not be submitted. Also measured what the design had only guessed: generation
  takes 1–3.5 minutes, not 30–60 seconds, which promotes the unbuilt
  `streamObject` handler from nicety to the worst moment in the product.
  Separately designed and recorded, unbuilt: [[exercise-alternatives]].
- 2026-08-09 — **Replaced the neon-HUD with the Graphite theme**
  ([[ui-design-system]]), one day after the HUD landed. The owner said the UI/UX
  was still bad and asked for five designs to choose from; five full mockups
  (light-product, refined-dark, athletic, warm, dense-console) were built as
  standalone HTML and screenshotted with **headless Chrome**, since no browser
  extension or Playwright is available — `chrome --headless --screenshot
  --window-size` is the whole tool, and `--force-prefers-reduced-motion` is
  required or reveal animations freeze the capture at opacity 0. The owner
  picked refined-dark. Porting it was mostly a token swap because the HUD had
  been built as CSS classes rather than utility soup; `hud-*` was renamed to
  `ui-*` wholesale rather than left behind, since `text-hud-cyan` rendering lime
  is worse than no name at all. Deleted: `hud-backdrop.tsx`, `pointer-glow.tsx`
  — which removes the only runtime inline style in the app. The alignment bug
  worth remembering: pages carrying `max-w-3xl` while the nav used `max-w-5xl`
  centred their content in a narrower column that visibly missed the brand above
  it; one shell width for every page is the fix. Screenshotted against a seeded
  throwaway database, because the real one still fails with the `.env`
  `Access denied for user 'hevy'` breakage already logged on 2026-08-08.
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
