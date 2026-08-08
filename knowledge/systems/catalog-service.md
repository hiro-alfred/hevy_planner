---
title: Catalog service — the local exercise-template cache
aliases: [catalog, catalog service, exercise cache, candidate filtering]
tags: [subsystem, hevy, catalog, sqlite]
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
- **Upsert then prune in one transaction.** Every row is stamped with this run's
  `fetchedAt`; rows carrying any other stamp are deleted as gone-upstream. An
  empty response **throws instead of pruning** — an empty library is far likelier
  to be an API fault than the truth.

Ids are de-duplicated before insert: `page_count` is a page total and pages can
shift underneath a multi-request walk, so the same template can arrive twice and
would otherwise break the multi-row insert on its own conflict. A `MAX_PAGES`
valve stops a looping response from spinning forever.

## Candidate filtering

`getCandidates({ equipment, muscleGroups, includeNonRepBased, limit })` resolves
to ONE SQL query:

- equipment → `equipment_category IN (…)`
- muscle group → primary match **OR** a correlated `EXISTS` over
  `json_each(secondary_muscle_groups)` (the column is a JSON array)
- type → restricted to the four rep-based types by default
  (`weight_reps`, `reps_only`, `bodyweight_reps`, `bodyweight_assisted_reps`),
  because every set in the plan model is a rep range; duration/distance
  templates would generate nonsense sets
- ordering → primary-muscle matches first, then built-ins before customs, so a
  `limit` truncates the least relevant tail rather than an arbitrary slice

Companions: `getTemplatesByIds` (batch id resolution for generation
post-validation), `searchTemplates` (title LIKE, for the swap-exercise picker),
`getCatalogStatus`, `getAvailableEquipment`, `getTemplateById`.

`constants.ts` holds the `MuscleGroup` / `EquipmentCategory` enum values copied
verbatim from the pinned spec — the API rejects anything outside them and offers
no endpoint that lists them.

## Traps found while building

- **A bare constant in `ORDER BY` is a column ordinal in SQLite.** Emitting
  `sql\`0\`` as a no-op ranking term fails with "1st ORDER BY term out of range";
  the ranking expression must be omitted entirely instead.
- **Windows keeps the SQLite file locked until the process exits**, so temp-DB
  cleanup in tests is best-effort.

Covered by `src/lib/hevy/catalog.test.ts` (vitest, temp SQLite file + a stub
client) — see [[testing-setup]].
