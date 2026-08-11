---
title: Plan editing — forks, tweaks, and reading Hevy back
aliases: [editing, plan editing, edit plan, fork, duplicate, routines page]
tags: [subsystem, planner, ui, sync, hevy]
type: subsystem
created: 2026-08-11
updated: 2026-08-11
sources:
  [
    src/lib/planner/plan-edit.ts,
    src/lib/planner/plan-edit.test.ts,
    src/lib/hevy/routines.ts,
    src/app/plans/[id]/edit-actions.ts,
    src/app/plans/[id]/exercise-edit.tsx,
    src/app/plans/[id]/edit/page.tsx,
    src/app/routines/page.tsx,
    src/app/plans/request-form.ts,
    src/lib/db/schema.ts,
    drizzle/0001_mature_siren.sql,
  ]
---

# Plan editing

Built 2026-08-11. Completes the "minimal-plus" edit scope [[plan-pipeline]]
closed as a decision, and adds the account read-back the app had never had.
The swap half is [[exercise-alternatives]]; the volume model it edits is
[[plan-generation]].

> [!important] Editing a request FORKS. It never overwrites.
> Owner's decision, 2026-08-11: "when the user edits their own plans and they
> save it, save it into something new, not replace their current plan." Saving
> the edit form writes a NEW plan row and leaves the original untouched.

## Why forking, and what it costs

The reason is [[hevy-sync]], not neatness. A request change re-runs generation
and replaces every day. If it did so in place, the plan's existing
`sync_links` would still point at real Hevy routines — so the next sync would
PUT completely different content over routines the user never agreed to lose,
and Hevy has **no DELETE** to undo it with. Forking makes that impossible by
construction rather than unlikely by warning.

The cost is real and lands in Hevy. A fork carries **no `sync_links` and no
`hevyFolderId`**, so its first sync CREATES a fresh folder and a fresh routine
per day while the original's routines stay exactly where they are. On a capped,
delete-less API that is the expensive direction, so both the edit page and the
plan page say so before anything is pressed.

What DOES carry over is `excludedExercises`, inside the request. A fork is a
continuation of the same thinking, and re-rejecting the same exercises is the
tedium the rejection list exists to remove. The form has no input for it, so
`parseRequest` takes a `carried` argument specifically to avoid dropping it.

`plans.derived_from_plan_id` records the parent. **No foreign key**, on purpose:
a self reference would either block deleting an original while a fork survives,
or cascade the delete into forks that are perfectly good plans. A dangling id is
the better failure — the UI reads it as "forked from a plan that no longer
exists" and the link simply 404s.

## The asymmetry: tweaks stay in place

Per-exercise edits — set count, rep range, rest — and swaps write the plan in
place. Forking per tweak would leave a dozen near-identical plans behind after
an afternoon adjusting one day. A **Duplicate** button covers deliberate
forking, so nothing is ever trapped.

> [!note] Revisit if the owner meant every edit
> This asymmetry is an interpretation, not an instruction. The instruction named
> saving; only the request form has a save step.

`applyExerciseEdit` (`plan-edit.ts`, pure) preserves what the edit does not
mention. Growing the set count copies the LAST set's weight into the new sets —
"one more of these" — because a null there reads in Hevy as a set whose load was
never decided. Shrinking drops from the end, so surviving sets keep the per-set
weights they already had. Set types survive too: a warmup set stays a warmup
set.

Unlike a swap, an edit **does** change session length; that is the point.
`validatePlan` re-runs on every render, so a day pushed outside ±20% surfaces as
a warning rather than being silently accepted or silently refused.

## Reading the account back (`/routines`)

Until now the app only wrote routines and knew only what it had created itself.
`getRoutines` walks `GET /v1/routines` (**pageSize caps at 10** — only
`exercise_templates` allows 100) and `getAccountRoutines` labels each routine
with the plan that owns it, via ONE query over `sync_links` rather than a lookup
per routine.

It closes three blind spots: routines made in the Hevy app were invisible,
routines orphaned by a deleted plan were invisible, and the undocumented routine
cap ([[hevy-api]]) could previously only be discovered by a POST 403 landing
partway through syncing a plan. Strictly read-only — the page issues GETs and
nothing else.

> [!warning] Foreign routines are read-only, and that is a data-model fact
> The plan model cannot hold an arbitrary Hevy routine. `planSetSchema` has only
> a rep RANGE, and `to-hevy.ts` hard-codes `reps: null`, `superset_id: null`,
> `duration_seconds: null`, `distance_meters: null`, `custom_metric: null`.
> Since PUT is a full replace, importing a routine built in the Hevy app and
> saving it back would silently destroy its fixed rep counts, its supersets and
> any duration or distance work — a plank cannot be represented at all.
> Adopting foreign routines requires extending the plan model FIRST.

## Verification status

144 vitest tests green, including a new `migrate.test.ts` that walks the real
UPGRADE path — migrate to the previous version, insert data, migrate forward,
assert the rows survive. Every other DB test migrates an empty database, so a
migration destructive only on populated data would otherwise pass the suite.

**Not human-verified.** No page has been clicked, and `/routines` has never run
against a real account — it needs a working `DATABASE_URL` and a Hevy key, both
of which are owner-blocked ([[hot]]).
