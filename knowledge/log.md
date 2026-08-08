---
title: Log — wiki journal
aliases: [log, journal]
tags: [meta, journal]
type: meta
created: 2026-08-08
updated: 2026-08-08
sources: []
---

# Log

Append-only journal of ingests, queries, and lint passes ([[schema]]). Newest entries
at the bottom. When this page nears the 300-line cap, move the oldest entries to
[[log-archive]].

- 2026-08-08 — bootstrap: vault created; specials plus 6 initial pages synthesized
  from the repo (see [[wiki-bootstrap]] for decisions made). Wiki test passing.
- 2026-08-08 — design session: architecture decided with owner and recorded in
  [[product-architecture]]; README.md rewritten as the design doc (via Sonnet
  subagent), CLAUDE.md gained code standards, .gitignore now covers .env.
  [[project-overview]] updated (product vision no longer UNVERIFIED).
- 2026-08-08 — architecture round 2 + scaffold: Hevy OpenAPI spec fetched via Opus
  subagent and pinned (docs/hevy-openapi.json), verified facts in new [[hevy-api]];
  core-flow design in new [[plan-pipeline]] (create-once-then-PUT sync forced by
  no-DELETE + routine cap); [[product-architecture]] updated (self-hosted server
  not Vercel, SQLite + Drizzle, AI SDK, kg default); [[hevy-platform]] open
  questions answered. Next.js scaffold merged (create-next-app + npm), Drizzle
  schema + planner Zod schema + thin Hevy client written, catalog/sync/generate
  left as documented stubs. Build + lint + wiki tests green.
- 2026-08-08 — milestone 1 (catalog): `src/lib/hevy/catalog.ts` implemented
  (fetch-then-write refresh, single-transaction upsert + prune, one-query
  candidate filter incl. json_each secondary-muscle match), spec enums extracted
  to `constants.ts`. vitest added as the app-side runner ([[testing-setup]]);
  13 tests caught two real bugs (bare `0` in ORDER BY read as a column ordinal;
  Windows SQLite file lock). New [[catalog-service]] page. Build, lint, vitest,
  wiki tests green.
- 2026-08-08 — milestone 1 review (Fable, commit 4f6b2fd): no blockers. Acted on
  the truncated-walk finding — a `page_count` past the safety cap now aborts
  instead of pruning everything beyond it. Refresh also switched from
  upsert-then-prune-by-timestamp to clear-then-insert in one transaction, after
  a test caught two same-millisecond refreshes sharing a `fetchedAt`. Deferred
  finding: candidate lists are not balanced per muscle group, so generation
  should call `getCandidates` once per training day (noted for milestone 3).
- 2026-08-08 — milestone 2 (settings): `/settings` page with masked key entry,
  test-connection and catalog-refresh actions; `src/lib/settings.ts` +
  `src/lib/hevy/session.ts` as the single key path; nav shell added to the
  layout. New [[key-handling]] page. Verified against a running server: the
  stored key appears 0 times in the rendered HTML, only its last 4 do.
- 2026-08-08 — milestone 2 review (Fable, fbe29d5): one important finding, fixed
  immediately because milestone 3 was about to copy the pattern — the error
  helper's `return error.message` fallback could echo the submitted key (a key
  containing a newline makes the fetch layer throw with the value quoted).
  Closed by `normalizeHevyApiKey` (shape-check before the fetch layer) plus
  `src/lib/hevy/errors.ts`, a context-aware translator that only returns
  status-derived or deliberately-authored text. Also: short keys no longer
  render in full, and clearHevyKeyAction no longer escapes its transition.
- 2026-08-08 — milestone 3 (plan flow): split→days, volume model, rule-based
  generator, LLM path (AI SDK, provider from env, `claude-opus-5` default),
  post-validation with one retry, `/plans/new` + `/plans/[id]`, and
  create-once-then-PUT sync. New [[plan-generation]] and [[hevy-sync]] pages.
  Two real bugs caught by tests: the session-length formula had drifted from
  the design (dropping the last set's rest), and an exercise-only cap made every
  60+ minute session fail its own validation. 54 vitest tests; verified against
  a running server with a seeded 192-exercise catalog (4-day plan, 0 violations).
- 2026-08-08 — milestone 4 (dashboard): create-next-app home page replaced with
  a plans list (status + synced-routine count via one grouped join) and a
  setup checklist. Caught a runtime-only bug the build passes: a server
  component cannot CALL a function exported from a `"use client"` module —
  `buttonClasses` moved to `src/components/button-styles.ts`. Noted in
  [[testing-setup]]; every route now curl-checked against `next start`.
- 2026-08-08 — milestone 5 (cleanup): unused create-next-app SVGs deleted,
  `.env.example` and README corrected (LLM_MODEL documented; all three LLM vars
  marked optional, since the app generates plans without any of them). Verified
  no inline styles, no file over 300 lines, no TODOs, no stray logging.
  Deliberately-unused-but-planned exports recorded in [[hot]] rather than
  deleted, so review passes stop re-flagging them.
- 2026-08-08 — milestone 3 review (Fable, 4bd98b7): key-leak fix confirmed
  closed, Hevy write schema confirmed correct, but TWO important write-path
  bugs found and fixed immediately ([[hevy-sync]]). (1) The folder id lived only
  on `sync_links`, which is written only after a routine create succeeds — so a
  first sync whose first create 403'd lost it and the retry created a second,
  undeletable folder. Folder id moved to the plans row (migration 0001), written
  the moment the folder is created. (2) A single training day with no candidates
  produced an empty day that sync would have pushed as an empty routine, burning
  routine-cap quota permanently; generation now aborts on ANY unfillable day and
  sync refuses empty days before its first API call. Also added
  `UNIQUE(plan_id, day_index)`, a `staleRoutines` warning for plans that shrank,
  and moved `getLlmConfig()` inside the try so a misconfigured provider falls
  back to the rules. 57 tests; migration verified applying to an existing DB.
- 2026-08-08 — milestone 6 (deploy readiness): `output: 'standalone'` +
  `serverExternalPackages: ['better-sqlite3']`, multi-stage Dockerfile
  (non-root, `/data` volume, ships `drizzle/` so boot migrations work),
  `.dockerignore`. New [[deployment]] page. Verified by running the standalone
  server in the image's file layout: migrations applied to a fresh DB and all
  pages served. Found that standalone binds the machine hostname unless
  `HOSTNAME` is set — the container would be unreachable without it.
- 2026-08-08 — sync-fix review (Fable, 1fdb910): both fixes confirmed genuine,
  migration verified against populated pre-migration DBs. It also caught that
  the concurrency claim was HALF WRONG — `UNIQUE(plan_id, day_index)` fires only
  after the duplicate routine already exists in Hevy, so it guards the database,
  not Hevy. Closed with a per-plan lock (`lib/hevy/plan-lock.ts`) making
  read-decide-write one critical section; a test firing two syncs at once fails
  on that very constraint when the lock is removed. Also: migration 0001 now
  dedups `sync_links` before creating the index (a DB already holding duplicates
  would otherwise fail the migration on every boot and brick the app — verified
  with a duplicate-row fixture), syncing a deleted plan is refused instead of
  stranding a folder, and the pre-migration folder id is backfilled onto the
  plan row. Lost-response duplication documented as a known gap in [[hevy-sync]].
- 2026-08-08 — FINAL cross-cutting review (Fable, whole run 3413321..HEAD):
  no security findings (both keys traced end to end), no duplicated core logic,
  no dead code beyond what [[hot]] records on purpose — but three seams BETWEEN
  milestones, all fixed. (1) Sync never re-ran the validator, so a user could
  press Sync on a plan whose own warning said its exercise ids don't resolve —
  it now refuses unresolvable ids before the first API call. (2) `deletePlan`
  did not take the sync lock, so a delete landing mid-sync could create a Hevy
  routine whose id could never be recorded. (3) The dashboard derived sync state
  from the `status` column while the plan page used content hashes: regenerating
  a synced plan reproduced an identical plan, so one screen said "Not synced"
  while the other said "up to date". Both now read the hashes. Minor: the
  provenance banner survived a regenerate and could describe the previous plan;
  empty equipment meant "anything" while the error text said one was required.
  63 tests. Run complete.
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
