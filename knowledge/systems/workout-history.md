---
title: Workout history — the local cache behind records
aliases: [workout history, history cache, workout sync, records data]
tags: [subsystem, hevy, cache, records]
type: subsystem
created: 2026-08-11
updated: 2026-08-15
sources:
  [
    src/lib/hevy/workout-sync.ts,
    src/lib/hevy/workout-rows.ts,
    src/lib/hevy/client.ts,
    src/lib/records/format.ts,
    docker-compose.yml,
    src/lib/db/schema.ts,
    drizzle/0002_mighty_iron_patriot.sql,
  ]
---

# Workout history — the local cache behind records

A local mirror of every workout the account has LOGGED, as opposed to the routines it
has planned. Feeds [[exercise-records]] and, through it, the recommendations described
in [[progressive-overload]]. Strictly read-only against Hevy: this subsystem issues
GETs and nothing else, which is what makes it safe next to the irreversible write path
in [[hevy-sync]].

> [!warning] Dates are the TRAINEE's calendar days, and the server must be told
> Hevy stores workout times as UTC instants, and every date in this app is rendered
> on the SERVER — where a container defaults to UTC. Two bugs came out of that on
> 2026-08-15, both reported from the real app:
>
> - `relativeDay` divided elapsed milliseconds by 24 hours, counting 24-hour blocks
>   rather than days. A session finished at 20:00 and read at 10:00 the next morning
>   is 14 hours old, which floored to 0 and printed **"today"** for a workout the
>   trainee did yesterday.
> - `formatDay` sliced the first 10 characters of the ISO string, which is the UTC
>   date. East of UTC an early-morning session carries the previous day's UTC date,
>   so the app printed the day before the one it happened on.
>
> Both now work in local calendar days (`calendarDaysBetween` rounds rather than
> floors, so a DST shift's 23- or 25-hour gap does not report yesterday as today),
> and `TZ` is set on the app service in `docker-compose.yml` — defaulting to UTC,
> which is honest for an unconfigured deployment, and set per-owner in `.env`.
> `daysSince` is exported so the records index's freshness dot is computed from the
> same number as the label beside it. See [[exercise-records]].

## Why a cache and not on-demand reads

`/records` aggregates across EVERY exercise at once, and [[hevy-api]] caps `pageSize`
at 10 on the workouts endpoints. Answering "what are my PRs" over the network would
therefore be hundreds of requests per page view. The catalog faced the same shape of
problem and reached the same answer ([[catalog-service]]).

> [!note] `/v1/exercise_history/{id}` is deliberately unused
> It looks like the obvious endpoint, and it is the wrong one. The pinned spec gives
> it **no pagination parameters and no `page_count`** — so it either returns an
> unbounded response or silently truncates, and both are disqualifying where a missing
> set is a missing record. `/v1/workouts` plus the `events` delta feed is the path Hevy
> documents for keeping a local cache current, so that is the path taken.

## Two tables

- `workouts` — one row per session. `hevy_updated_at` is the cursor source.
- `workout_sets` — one row per logged set, flattened out of
  `workout.exercises[].sets[]`, indexed on `exercise_template_id`.

`exercise_title` is **denormalised** onto every set rather than joined from the catalog.
History can reference a template the catalog no longer holds (a deleted custom
exercise), and a record must not vanish from the page because the catalog cache is
stale or was never refreshed.

Migration `0002` is additive: two new tables, nothing existing touched.

## Two sync strategies

Chosen by whether a cursor exists in `settings.workout_sync_cursor`:

| Mode         | Endpoint                       | When                  |
| ------------ | ------------------------------ | --------------------- |
| **backfill** | `/v1/workouts`                 | no cursor, or forced  |
| **delta**    | `/v1/workouts/events?since=`   | cursor present        |

Both walk the network to completion BEFORE opening a transaction, so a fetch that dies
on page 40 of 200 leaves the previous cache exactly as it was rather than truncating
the history to a prefix. Neither ever runs on a page render — only from the sync
buttons on `/records`.

Four properties are load-bearing:

- **The cursor is Hevy's `updated_at`, never the local clock.** Using local time would
  skip every workout logged while the two disagreed. It is written only after the
  transaction commits.
- **An update replaces the workout's sets wholesale.** A set deleted inside the Hevy
  app produces no event of its own, so anything short of replacing them keeps a set
  that no longer exists — and a phantom set is a phantom personal record.
- **Applying an event twice is a no-op by construction.** Nothing documents whether
  `since` is inclusive or exclusive; because re-application cannot corrupt anything,
  it does not have to be known.
- **Events are newest-first, so the FIRST event per workout wins.** A workout edited
  twice and then deleted must end up deleted, not restored.

## Traps and open risks

- **`updated_at` is the one field NOT refused when missing.** Every other required
  field throws with its own name (the `equipment_category` lesson from
  [[catalog-service]]), but the cursor field falls back to `start_time`: an early
  cursor costs a harmless re-serve, while refusing would turn one renamed field into a
  records page that can never sync at all.
- **Monotonicity is assumed.** If Hevy ever backdates an edit's `updated_at`, a delta
  misses it. "Re-sync everything" on `/records` is the repair, which is why it exists.
- **Backfill cost is real** — 10 workouts per request against undocumented rate
  limits. A 2,000-workout account is 200 requests.
- **UNVERIFIED against a real account.** Every shape here comes from the pinned spec,
  which [[hevy-api]] has already caught lying about a field name once. The whole
  subsystem has only ever run against stubs and hand-seeded rows.
