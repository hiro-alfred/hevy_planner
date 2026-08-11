---
title: Progressive overload — a deterministic engine, not the LLM
aliases: [progressive overload, progression engine, double progression, overload]
tags: [decision, records, progression, training]
type: design
created: 2026-08-11
updated: 2026-08-11
sources: [src/lib/records/progression.ts, src/lib/planner/prescription.ts, src/lib/planner/rules.ts, src/lib/planner/suggested-loads.ts]
---

# Progressive overload — a deterministic engine, not the LLM

Built 2026-08-11 alongside [[exercise-records]], on the cache from [[workout-history]].
Answers one question per exercise: **what should the next session be?**

## The decision: rules, not an LLM

The obvious move was to hand the set history to the model that already writes plans
([[plan-generation]]). Rejected, for three reasons:

1. **Progression is arithmetic.** The correct answer is not in dispute, so an LLM would
   add nondeterminism and latency to a calculation that has one right result.
2. **It has to work with no provider configured.** There is still no `LLM_API_KEY` on
   this machine, so an LLM-only feature would be unverifiable the day it shipped —
   and the rule-based generator in `rules.ts` is already the project's reference
   implementation, explicitly "NOT a degraded mode".
3. **The prose already existed.** Generated plans describe double progression in words;
   this makes the same description executable.

The rep bands are **imported from `prescription.ts`**, not restated. Two copies of
those numbers would let a plan and its progression advice drift apart silently.

## The algorithm

Double progression: reps climb inside a fixed range, and only when every set reaches
the top does the weight move and the reps reset to the bottom.

**Rep band is inferred from behaviour, not asked for.** Median reps over the last three
sessions, snapped to a `prescription.ts` band. Someone doing sets of 5 is training
strength whatever a plan's free-text goal says. Median rather than mean so one AMRAP
set at the end of a session cannot reclassify the exercise. This independence was
worth having: the `classifyGoal` default-text bug ([[trainee-profile]], fixed
2026-08-11) mislabelled plans for weeks without ever misleading the recommendations
here, because they read the log rather than the request.

Rules, in precedence order, judged against the sets at the session's **hardest load**
(a back-off set is not evidence about the working weight):

| Order | Rule            | Trigger                                    | Result                       |
| ----- | --------------- | ------------------------------------------ | ---------------------------- |
| 1     | baseline        | fewer than 2 sessions                      | repeat and log               |
| 2     | layoff deload   | > 28 days since the last session           | −10%, rebuild                |
| 3     | add weight      | every set at the top of the range          | +1 increment, reps reset     |
| 4     | stall deload    | 3 sessions, same load, no added total reps | −10%, rebuild                |
| 5     | add reps        | every set at least at the bottom           | +1 rep, same load            |
| 6     | hold            | otherwise                                  | repeat the load              |

Increments are equipment-derived — dumbbell 2 kg, kettlebell 4 kg, else 2.5 kg —
because a 2.5 kg recommendation on a kettlebell is advice the lifter cannot follow. A
heuristic, deliberately not yet configurable.

Three details that are easy to get wrong:

- **Stall is measured on TOTAL reps, not the best set.** Adding a rep to the last set
  is real progress at the same weight; calling that a stall would deload someone who is
  moving forward.
- **A 10% cut that rounds back to the same number is not a deload** — it steps down a
  full increment instead, floored at zero.
- **`bodyweight_assisted` inverts everything.** The weight is assistance, so less of it
  is the harder set: the top set is the MINIMUM load, and progress subtracts.
  `reps_only` has no load at all, so reps are the only dial and the terminal advice is
  "find a harder variation".

## Scope

**Read-only. It recommends; it never writes to Hevy and never edits a plan by itself.**

Since 2026-08-11 it does reach plans, through [[suggested-loads]]: the plan page runs
this same engine over the exercises a generated plan contains and offers the resulting
loads as suggestions. `rules.ts` still emits `weightKg: null` at generation — but on the
irreversibility of [[hevy-sync]] now, not on the obsolete grounds that "the app has no
lifting history yet". A suggestion becomes a plan weight only when the trainee applies
it, so the read-only limit above still holds where it matters.

Fully unit-tested (21 cases) and exercised end-to-end against a seeded database; never
run against a real Hevy account.
