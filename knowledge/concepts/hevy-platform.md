---
title: Hevy platform
aliases: [Hevy, Hevy app, Hevy API]
tags: [concept, domain, hevy]
type: concept
created: 2026-08-08
updated: 2026-08-08
sources: [README.md]
---

# Hevy platform

Domain context for [[project-overview]]. **Caveat**: the repo contains no code or docs
yet, so everything here is general knowledge about Hevy plus inference from the repo
name — verify against real requirements before building on it, per the source-of-truth
rule in [[schema]].

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

## Open questions

- Does the planner write routines into Hevy, read history out for analysis, or both?
- Is the Hevy API actually the mechanism, or is import/export (CSV) the target?

Record the answers as pages under `decisions/` when they land (see [[wiki-bootstrap]]
for how the vault handles unknowns).
