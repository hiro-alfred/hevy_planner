---
title: Hevy platform
aliases: [Hevy, Hevy app, Hevy API]
tags: [concept, domain, hevy]
type: concept
created: 2026-08-08
updated: 2026-08-08
sources: [README.md, docs/hevy-openapi.json]
---

# Hevy platform

Domain context for [[project-overview]]. The original "general knowledge, verify
before building" caveat is resolved: the official OpenAPI spec was fetched on
2026-08-08 and pinned at `docs/hevy-openapi.json` — verified endpoint/schema facts
now live in [[hevy-api]], which supersedes the API sketch below where they differ.

## What Hevy is

Hevy is a workout-tracking app (iOS/Android/web) centered on strength training: users
log workouts as a sequence of exercises, each with sets (weight, reps, RPE, rest),
build reusable **routines**, and organize routines into **routine folders**.

## The public API (likely integration surface)

Hevy exposes a public REST API (api.hevyapp.com, key-based auth via an `api-key`
header; API keys are available to Hevy Pro users from the app's developer settings).
Core resources, as of the knowledge cutoff:

- `workouts` — logged workout history (paginated), plus a count and an events/changes
  endpoint for sync.
- `routines` — CRUD for planned workouts; this is the natural write target for a
  *planner* that generates programs.
- `exercise_templates` — the exercise catalog (name, muscle groups, equipment),
  including custom exercises.
- `routine_folders` — grouping for routines (e.g. one folder per program/mesocycle).

## Formerly open questions — answered 2026-08-08

- The planner **writes routines** into Hevy (create-once-then-PUT model in
  [[plan-pipeline]]); reading history for progression logic is a possible later
  feature via `exercise_history` ([[hevy-api]]).
- The **Hevy API is the mechanism** — not CSV import/export ([[product-architecture]]).

(Unknown-handling per [[wiki-bootstrap]]: answers recorded under `decisions/`.)
