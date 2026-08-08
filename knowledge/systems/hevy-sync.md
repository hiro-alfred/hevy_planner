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

- **One folder per plan, one routine per training day.** The folder id is read
  back from the first `sync_links` row; folders can't be deleted either, so
  creating a second would leave an orphan.
- **Create once, then PUT.** A day with no link is created; a day with a link is
  PUT full-replace against the stored routine id.
- **Ids are recorded as each create returns**, not batched at the end. A sync
  that dies halfway leaves every already-created routine linked, so the retry
  resumes instead of duplicating. Covered by a test that fails the second create
  and then re-runs.
- **403 is surfaced, never retried.** Retrying a routine-cap rejection cannot
  succeed; the message tells the user to remove routines in the Hevy app.
- **Unchanged days are skipped** via a content hash.

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
