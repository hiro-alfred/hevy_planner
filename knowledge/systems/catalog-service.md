---
title: Catalog service — the local exercise-template cache
aliases: [catalog, catalog service, exercise cache, candidate filtering]
tags: [subsystem, hevy, catalog, mariadb]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [src/lib/hevy/catalog.ts, src/lib/hevy/constants.ts, src/lib/hevy/catalog.test.ts, src/lib/db/schema.ts]
---

# Catalog service

Stage 2 of the [[plan-pipeline]]: mirrors Hevy's entire `exercise_templates`
library into the local `exercise_templates` table and serves the filtered
candidate lists that generation prompts consume. Lives in `src/lib/hevy/catalog.ts`.

> [!info] Why a cache is mandatory, not an optimization
> The Hevy API has **no search or filter parameters** on `exercise_templates`
> ([[hevy-api]]), so the only way to answer "which chest exercises can this user
> do?" is to hold the library locally. Per-exercise remote lookups would also be
> the N+1 pattern the repo rules ban.

## Refresh contract

`refreshCatalog(client)` walks every page (pageSize 100, the only endpoint with a
100 cap) and then replaces the cache. Two properties are deliberate:

- **Fetch fully, then write.** The whole network walk completes before the
  transaction opens, so a mid-walk failure leaves the previous cache untouched
  instead of truncating it.
- **Clear then insert in one transaction.** The table is emptied and refilled
  atomically, so readers never see a partial cache. Two refusals guard it: an
  empty response **throws instead of writing** (an empty library is far likelier
  to be an API fault than the truth), and a `page_count` above the `MAX_PAGES`
  safety valve **aborts** rather than persisting a truncated walk — writing the
  first N pages would silently delete every template living past them.

Ids are de-duplicated before insert: `page_count` is a page total and pages can
shift underneath a multi-request walk, so the same template can arrive twice and
would otherwise break the multi-row insert on its own conflict.

> [!note] Why not upsert-then-prune-by-timestamp
> The first implementation stamped each row with the run's `fetchedAt` and
> deleted rows carrying any other stamp. Two refreshes inside the same
> millisecond share a timestamp, so the prune kept gone-upstream rows — a test
> caught it. Clear-then-insert has no such dependency and costs nothing at this
> table's size.

## Candidate filtering

`getCandidates({ equipment, muscleGroups, includeNonRepBased, limit })` resolves
to ONE SQL query:

- equipment → `equipment_category IN (…)`
- muscle group → primary match **OR** an OR-chain of
  `JSON_CONTAINS(secondary_muscle_groups, JSON_QUOTE(?))`, one probe per
  requested group (the column is a JSON array)
- type → restricted to the four rep-based types by default
  (`weight_reps`, `reps_only`, `bodyweight_reps`, `bodyweight_assisted_reps`),
  because every set in the plan model is a rep range; duration/distance
  templates would generate nonsense sets
- ordering → primary-muscle matches first, then built-ins before customs, so a
  `limit` truncates the least relevant tail rather than an arbitrary slice

> [!important] Call it once per training day, not once per plan
> The result is one flat list ordered by (primary-match, is_custom, title), with
> no per-muscle-group balancing. A whole-plan call spanning many groups can let
> `limit` alphabetically starve a group of candidates — and since generation may
> only use listed ids, that group's training day then cannot be filled. Callers
> therefore request candidates **per training day**, passing just that day's
> muscle groups. Doing so is a handful of queries per plan, not an N+1 over
> exercises.

Companions: `getTemplatesByIds` (batch id resolution for generation
post-validation), `searchTemplates` (title LIKE, for the swap-exercise picker),
`getCatalogStatus`, `getAvailableEquipment`, `getTemplateById`.

`constants.ts` holds the `MuscleGroup` / `EquipmentCategory` enum values copied
verbatim from the pinned spec — the API rejects anything outside them and offers
no endpoint that lists them.

## Traps found while building

- **A bare constant in `ORDER BY` is a column ordinal.** Emitting `sql\`0\`` as a
  no-op ranking term fails with "1st ORDER BY term out of range"; the ranking
  expression must be omitted entirely instead. Found on SQLite, but MariaDB
  reads a bare integer the same way, so the guard survived
  [[mariadb-migration]].
- **MariaDB has neither `json_each()` nor `JSON_OVERLAPS`.** `JSON_OVERLAPS` is
  MySQL 8 only, and there is no table function to unnest a JSON array — hence
  the OR-chain of `JSON_CONTAINS` probes above rather than a single set-overlap
  call. It is still one query, which is what the no-N+1 rule asks for.
- **The `LIKE` escape character is `!`, not a backslash.** `escape '\'` does not
  parse on MariaDB (the backslash escapes the closing quote), and the doubled
  form breaks under `NO_BACKSLASH_ESCAPES` instead. `!` means the same thing in
  every `sql_mode`, and `searchTemplates` escapes `!`, `%`, and `_` in the user's
  input to match.

Covered by `src/lib/hevy/catalog.test.ts` (vitest, throwaway MariaDB database +
a stub client) — see [[testing-setup]].
