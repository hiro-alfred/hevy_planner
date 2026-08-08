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
- **Nothing empty or unresolvable is ever pushed.** Before the first API call
  sync refuses a day with no exercises, and refuses any plan referencing an
  exercise missing from the cached catalog. Both would otherwise fail *partway*
  — after earlier days already existed as permanent routines. Generation
  refuses earlier still: any training day with zero candidates aborts the
  request.

> [!note] The validator has to run at the sync boundary too
> Generation validates, and the preview shows the warnings — but nothing stopped
> a user pressing Sync on a plan whose warning said "these ids don't resolve".
> A rule enforced only where it is first computed is not enforced; it has to be
> checked where the irreversible thing happens.
- **One sync at a time per plan** (`lib/hevy/plan-lock.ts`). Runs queue rather
  than fail, so the second one simply finds every day already linked. Deleting
  a plan takes the same lock — otherwise a delete landing mid-sync pulls the
  plans row out from under the loop, and the next routine create succeeds in
  Hevy while recording its id fails on the foreign key, leaving a permanent
  routine whose id nothing holds.
- **`UNIQUE(plan_id, day_index)`** on `sync_links` as the backstop underneath
  that lock.
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

> [!warning] A unique index protects the database, not Hevy
> `UNIQUE(plan_id, day_index)` was added believing it stopped concurrent syncs
> from duplicating routines. It does not: it rejects the second **link row**,
> which happens only after the second **routine** already exists in Hevy — and
> that routine can never be deleted. The decision and the write have to be one
> critical section, which is what `withPlanLock` provides. Pinned by a test
> that fires two syncs at once; with the lock removed it fails on exactly that
> unique constraint, which is the duplicate-write it was supposed to prevent.
>
> Generally: a database constraint cannot undo an external side effect that
> already happened.

> [!warning] The lock is in memory, so it does not span app instances
> It holds for one server process, which is the deployment this app is built for
> ([[deployment]]). Worth re-reading before scaling out: [[mariadb-migration]]
> made a second instance against the same database *possible* in a way a local
> database file never did, and two instances would each keep their own lock map.
> The unique index would still stop the duplicate link row — after the duplicate
> Hevy routine already exists, which is the case above. A second instance needs
> this replaced by a database-level lock (MariaDB `GET_LOCK`), not just more
> replicas.

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

## Known gap: a lost response still duplicates

If `POST /v1/routines` (or the folder create) succeeds on Hevy's side but the
response never arrives — a timeout — no id is recorded and the retry creates a
second permanent object. Closing this needs a reconcile-by-title read before
creating; `GET` endpoints exist for both routines and folders ([[hevy-api]]), so
it is possible, just not built. Unlike the fixed bugs, this one needs a network
failure at exactly the wrong moment.

## Known gap: routines the plan no longer wants

If a plan is regenerated with fewer days, the routines for the removed days stay
in Hevy and nothing will ever update them again — the API cannot delete them.
`getSyncState` counts these as `staleRoutines`, the plan page never claims to be
"up to date" while one is stranded, and it tells the user to remove them in the
Hevy app. Renaming is the same story: a folder keeps its original title even if
the plan title changes, because the API has no folder rename.
