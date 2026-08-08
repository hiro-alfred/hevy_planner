---
title: Hevy sync — create-once-then-PUT
aliases: [sync, hevy sync, routine sync, sync_links]
tags: [subsystem, hevy, sync]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [src/lib/hevy/sync.ts, src/lib/planner/to-hevy.ts, src/lib/hevy/sync.test.ts, src/lib/db/schema.ts]
---

# Hevy sync

Stage 4 of the [[plan-pipeline]], in `src/lib/hevy/sync.ts`. Deterministic — no
LLM anywhere near the write path.

> [!danger] Every write to Hevy is permanent
> The API has **no DELETE**, and `POST /v1/routines` is capped with an
> undocumented limit that returns 403 ([[hevy-api]]). A duplicate routine cannot
> be cleaned up through the API and permanently consumes part of the user's
> quota. That single fact dictates the whole design.

## The contract

- **One folder per plan, one routine per training day.** The folder id lives on
  the **plans row** and is written the instant the create returns.
- **Nothing empty is ever pushed.** A day with no exercises is refused before
  the first API call: an empty routine would permanently consume part of the
  routine cap for something useless. Generation refuses earlier still — any
  training day with zero candidates aborts the whole request.
- **`UNIQUE(plan_id, day_index)`** on `sync_links`, so two concurrent first
  syncs cannot both link the same day and leave duplicate routines behind.
- **Create once, then PUT.** A day with no link is created; a day with a link is
  PUT full-replace against the stored routine id.
- **Ids are recorded as each create returns**, not batched at the end. A sync
  that dies halfway leaves every already-created routine linked, so the retry
  resumes instead of duplicating. Covered by a test that fails the second create
  and then re-runs.
- **403 is surfaced, never retried.** Retrying a routine-cap rejection cannot
  succeed; the message tells the user to remove routines in the Hevy app.
- **Unchanged days are skipped** via a content hash.

> [!warning] Why the folder id is not on `sync_links`
> It was, and that was a leak. `sync_links` rows are written only after a
> routine create succeeds — so a first sync whose **first** create failed (the
> routine-cap 403 this design explicitly expects) lost the folder id entirely,
> and the retry created a **second** folder. Folders have no DELETE endpoint,
> so every failed-then-retried first sync stranded one more, permanently. The
> id now lives on the plans row, written the moment the folder is created,
> before any routine write can fail. Pinned by a test that 403s the first
> create and then re-syncs.
>
> The general shape of the bug is worth remembering: **state recorded only as a
> side effect of a later step is lost whenever that step fails.**

## What the hash covers

`routineHash` in `to-hevy.ts` hashes the **routine payload**, not the plan day.
So the hash changes exactly when the bytes Hevy would receive change: an
internal rename that never reaches the API won't trigger a pointless PUT, and a
mapping change that does reach it won't be missed. That same hash powers the
free "unsynced changes" indicator on the plan page (`getSyncState`).

## Mapping notes

`dayToRoutine` sets every field the write schema accepts, including the ones we
never use — the spec does not document which fields are optional, so sending
explicit nulls is safer than omitting them. Rest lives on the exercise, not the
set. Sets always carry `rep_range` and a null `reps`. `superset_id` is null
throughout (no supersets in phase 1); if routines are ever read back, the
`superset_id` / `supersets_id` quirk from [[hevy-api]] must be normalised here.

## Known gap: routines the plan no longer wants

If a plan is regenerated with fewer days, the routines for the removed days stay
in Hevy and nothing will ever update them again — the API cannot delete them.
`getSyncState` counts these as `staleRoutines`, the plan page never claims to be
"up to date" while one is stranded, and it tells the user to remove them in the
Hevy app. Renaming is the same story: a folder keeps its original title even if
the plan title changes, because the API has no folder rename.
