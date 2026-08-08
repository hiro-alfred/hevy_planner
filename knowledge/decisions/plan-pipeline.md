---
title: Plan pipeline — generation, data model, sync
aliases: [plan pipeline, core pipeline, generation pipeline, sync model]
tags: [architecture, decisions, pipeline, llm, hevy]
type: design
created: 2026-08-08
updated: 2026-08-08
sources: [README.md, docs/hevy-openapi.json]
---

# Plan pipeline — generation, data model, sync

Core-flow design, decided with the owner 2026-08-08 (round 2, recorded in [[log]]).
Extends [[product-architecture]]; grounded in the verified [[hevy-api]] surface.

## Four stages

1. **Plan request** — typed input: goal, session length, sessions/week, split,
   experience, equipment. Persisted, so plans are reproducible/regenerable.
2. **Catalog service** — page the full `exercise_templates` library (pageSize 100)
   into MariaDB; refresh manually/periodically. Mandatory, not an optimization: the
   API has no search ([[hevy-api]]), and per-exercise lookups would be N+1
   (banned by CLAUDE.md). Pre-generation filter (equipment + split-relevant muscle
   groups) yields ~100–150 candidates for the prompt.
3. **Generation** — AI SDK `streamObject` against a plan Zod schema (streaming so
   the 30–60 s generation fills the preview progressively). Prompt = coaching
   system prompt + params + candidate list (`id — name (muscle, equipment)`), hard
   rule: only listed template ids. Post-validation: (a) every id resolves,
   (b) day count = sessions/week, (c) session-length sanity: Σ sets × (~45 s +
   rest_seconds) within ±20% of requested. One retry with violations appended;
   second failure surfaces the raw attempt — never silently degrade.
4. **Hevy sync** — deterministic, no LLM. **Create-once-then-PUT**: one folder per
   plan + one routine per training day created on first sync, ids recorded as each
   create returns (mid-failure → resume, not duplicate); every later sync is a PUT
   full-replace against stored ids. Forced by no-DELETE + routine-limit 403
   ([[hevy-api]]). Never auto-push: generate → preview/edit → explicit sync.

## Data model (MariaDB + Drizzle)

- `settings` — key-value: Hevy API key, LLM prefs, display unit.
- `exercise_templates` — normalized catalog cache (filtering is a WHERE clause).
- `plans` — request params (JSON) + generated plan (JSON, Zod-validated at every
  boundary) + status. The plan is a **JSON document, not normalized tables**: it
  is edited/synced as a whole, its schema evolves with prompts, and no query wants
  cross-plan sets. Only relational things get tables.
- `sync_links` — plan_id, day_index, folder_id, routine_id, last_synced_at,
  content hash (free "unsynced changes" indicator; re-sync skips untouched days).

## App surface

Pages: `/` (plan list), `/plans/new`, `/plans/[id]` (preview/edit + sync),
`/settings`. Mutations via server actions; generation is a route handler (for
streaming). Modules: `lib/db/`, `lib/hevy/` (client + catalog + sync),
`lib/planner/` (schema + filter + prompt + generate loop) — respects the
300-line cap by construction.

## Decisions closed this round

- **Edit scope: minimal-plus.** Swap-exercise (catalog picker) + per-exercise
  set-count/rep-range/rest tweaks. No reorder/add/remove-day/free-form editor in
  phase 1; "regenerate" covers structural dissatisfaction.
- **Hevy key: plaintext in `settings` table.** Encryption at rest is theater on a
  single-user box (decryption key would sit beside the DB). Real protections:
  key never sent to client (UI shows "set ✓ · ····last4"), never logged, DB file
  app-user-only, deployment behind an auth gate (e.g. Cloudflare Access).
  Re-decide at phase 2 multi-user.
- **Units: kg is the default and the only internal unit** (matches `weight_kg` in
  [[hevy-api]]). lbs is a display-only opt-in via settings; conversion happens in
  UI components, nowhere else.
