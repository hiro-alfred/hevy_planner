---
title: Hevy API — verified surface
aliases: [hevy api, hevy openapi, hevy api spec]
tags: [concept, hevy, api, verified]
type: concept
created: 2026-08-08
updated: 2026-08-08
sources: [docs/hevy-openapi.json]
---

# Hevy API — verified surface

Verified facts from the official OpenAPI spec (fetched 2026-08-08 from
api.hevyapp.com/docs/, pinned at `docs/hevy-openapi.json` — the docs page is a JS
shell; the spec is inlined in `swagger-ui-init.js` under `swaggerDoc`). Supersedes
the "general knowledge, verify before building" caveat in [[hevy-platform]].
Consumed by the pipeline design in [[plan-pipeline]].

> [!warning] Explicitly unstable
> Spec version is 0.0.1 and the preamble says the structure may change or the
> project may be abandoned. Pro-only. Keep the client a thin adapter; on drift,
> re-fetch the spec, diff against the pinned copy, and update this page.

## Auth

Header `api-key` (lowercase, hyphenated), UUID string. Keys from
hevy.com/settings?developer (Hevy Pro required). No 401 shape documented.

## Endpoints that matter to us

- `GET/POST /v1/routines`, `GET/PUT /v1/routines/{routineId}` — **no DELETE, no
  PATCH anywhere in the API**. PUT body = same shape as POST → full replace
  (undocumented but implied; verify empirically once).
- `GET /v1/exercise_templates` (+ `/{id}`) — catalog. **No search/filter params at
  all**; pageSize max 100 (only endpoint with a 100 cap; others cap at 10). Must
  page the whole library and cache locally ([[plan-pipeline]] catalog service).
- `POST /v1/exercise_templates` — custom exercise creation exists but returns an
  **integer** id (elsewhere ids are strings) and can 403
  `exceeds-custom-exercise-limit`. Fallback only, not the happy path.
- `GET/POST /v1/routine_folders` (+ `/{id}`) — create takes only `title`; new
  folders always land at index 0. Folder ids are **numbers**; routine ids are
  **strings**.
- `GET /v1/exercise_history/{exerciseTemplateId}` — per-set history (weight_kg,
  reps, rpe) with date filters; future progression-logic input.
- `GET /v1/workouts/events?since=` — delta feed, future cache-sync input.

## Routine create/update schema (the write path)

Body: `{ "routine": { title, folder_id (number|null), notes, exercises[] } }`.

Exercise: `exercise_template_id` (string), `superset_id` (int|null),
`rest_seconds` (int|null — **rest lives on the exercise, not the set**),
`notes` (string|null), `sets[]`.

Set: `type` enum **exactly** `warmup | normal | failure | dropset`;
`weight_kg` (kg only — no unit field anywhere); `reps`;
`rep_range { start, end }` — **rep ranges ARE supported on routine sets**
(not on workout sets); `distance_meters`, `duration_seconds`, `custom_metric`.
No per-set notes, no per-set rest, no writable RPE on routines.

Ordering of exercises/sets = array order only (`index` appears on reads, not
writes). Required fields are effectively undocumented — validate with Zod and
test empirically.

## Known traps

- Write field `superset_id`, read field `supersets_id` (plural) — normalize in the
  adapter or round-trips corrupt supersets.
- `POST /v1/routines` → 403 "Routine limit exceeded" (cap undocumented). With no
  DELETE, every created routine is permanent from the API's view → sync must be
  create-once-then-PUT ([[plan-pipeline]]).
- Errors: `{ "error": string }` on 400/403; other codes schemaless. No rate limits
  documented — assume they exist, back off on non-2xx.
- Pagination responses: `{ page, page_count, <collection>[] }`; `page_count` is
  pages, not items — no total-item count exists.
