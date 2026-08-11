---
title: Suggested loads — history feeding plan generation
aliases: [suggested loads, starting loads, load prefill, weight prefill]
tags: [decision, planner, records, training, hevy]
type: design
created: 2026-08-11
updated: 2026-08-11
sources:
  [
    src/lib/planner/suggested-loads.ts,
    src/lib/planner/plan-loads.ts,
    src/lib/records/last-session.ts,
    src/lib/planner/plan-edit.ts,
    "src/app/plans/[id]/page.tsx",
    "src/app/plans/[id]/plan-preview.tsx",
    "src/app/plans/[id]/edit-actions.ts",
  ]
---

# Suggested loads — history feeding plan generation

Built 2026-08-11. Closes the loop the project has been building towards: the workout
cache ([[workout-history]]) and the progression engine ([[progressive-overload]]) now
answer "what weight do I start this exercise at?" on a generated plan, instead of only
on `/records`.

The comment this replaces, in `rules.ts`, read:

> Starting loads are left to the user: the app has no lifting history yet, and a wrong
> suggested weight is worse than an empty field.

**The first clause is now false and the second is still true**, and the whole design
follows from taking both halves seriously.

## The decision: suggest, don't commit

The owner's call, 2026-08-11, given three options. The one taken: generation still
emits `weightKg: null`, the plan page SHOWS the load the history implies, and it
becomes a plan weight only when the trainee presses **Use suggested loads**.

The reason is [[hevy-sync]]: `planSetSchema` carries `weightKg`, `to-hevy.ts` maps it
into the routine payload, and [[hevy-api]] has **no DELETE endpoint**. A weight
prefilled at generation would need only one sync — a button the user is being invited
to press — to become a permanent routine in their account holding a number nobody ever
read. `/records` is read-only by design for exactly this reason, and a computed weight
crossing into the account silently would have spent that caution for nothing.

So the gap between "the app worked out what you should lift" and "your account says
so" is deliberate, and is one click wide. Rejected alternatives:

- **Prefill and label loudly.** Fewer parts, but a generate-then-sync with no clicks in
  between still writes computed weights to Hevy.
- **Display only, never sync.** Safest, and useless: the loads would live on a screen
  and be retyped by hand into the app they were computed for.

## Where it runs, and why not in the generator

**After generation, for both generators, on every render of the plan page.** Three
consequences, all wanted:

1. **The two generators cannot disagree.** [[plan-generation]] runs the rules or the
   LLM behind one entry point; a load prefilled in one path only would mean the same
   request produced materially different plans depending on whether a key is
   configured. Suggestion happens downstream of both, so it is identical either way.
2. **The prompt stays cheap.** Telling the model about the history would undo the
   compaction that took a six-day plan body from 16.9k to 2.2k characters, to have it
   do arithmetic worse than `progression.ts` does it.
3. **Suggestions never go stale.** Nothing is cached with the plan, so a plan opened
   after this morning's workout synced suggests against this morning's workout. The
   apply action recomputes from the database rather than trusting the page.

The numbers come from `recommendProgression` — the SAME call `/records` makes, asserted
by a test that compares the two. Not a second opinion written for the generator: two
progression rules in one codebase eventually disagree, and then the plan page and the
records page tell one lifter two things about one barbell.

## The rep-band trap

The engine infers a rep band from what was LOGGED ([[progressive-overload]]); the plan
prescribes one from the request ([[plan-generation]]). They need not match, and the
naive prefill is dangerous when they do not:

> [!warning] 140 kg is a true statement about sets of five and a reckless one about
> sets of twelve
> Someone who trains squats heavy has a `strength` band (3–6) inferred from their log.
> Dropping that load into a hypertrophy plan's 3×8–12 is precisely the "wrong suggested
> weight" the original null was protecting against — and it would arrive looking like
> evidence, because it is real.

So each suggestion carries `transferable`: true only when the plan prescribes the same
band the number was earned in. Both kinds are SHOWN, with the mismatched ones stating
the band they came from ("140 kg at 3–6 reps, not this plan's 8–12 — set it yourself if
it fits") in muted rather than accent colour. Only transferable ones are counted by, or
written by, the bulk apply. Anyone who looks at the number and decides it fits takes it
through the per-exercise Edit form.

Bands compare by exact equality, not overlap, because both sides come from the same
`BY_GOAL` table — so equality is the honest test, and a hand-edited custom range simply
falls to the conservative side.

## What is not suggested

Absent, never guessed: an exercise with **no logged history** (unchanged behaviour, and
still correct — a suggestion needs evidence); a **bodyweight movement**, which has no
load to suggest; an **assisted lift whose next step is zero assistance**, which
`planSetSchema` cannot express since it takes a positive number or null; and an
exercise **the catalog no longer holds**, because the equipment is what sets the
increment and a 2.5 kg step on a kettlebell is advice nobody can follow.

## The N+1 that had to be avoided

A plan is up to 7 days x 8 exercises, and the engine needs SESSIONS per exercise —
which `metrics.ts` only offered one exercise per call. `getRecentSessions(ids)` in
`last-session.ts` is the batched answer, joining the two existing per-list queries in
that module:

- One `inArray` over the template ids, grouped in JS, so a whole plan costs **two
  queries** (history + catalog) rather than fifty-six.
- `dense_rank()` numbers each exercise's sessions newest-first **inside the database**
  and the outer select keeps only the first few, so a five-year-old squat entry
  contributes three sessions instead of three hundred rows fetched and discarded.
  Ranking on the DATE rather than the workout id is what makes the cut land between
  sessions rather than inside one.
- The depth defaults to `PROGRESSION_WINDOW`, exported from `progression.ts` rather
  than restated: fetching four sessions for rules that read three is waste, and
  fetching two would silently disable the stall rule.

## Weight became editable, too

`exerciseEditSchema` gained an optional `weightKg` with three distinct states, which is
what keeps every pre-existing caller behaving as before: a number sets every set,
an explicit `null` clears the load, and an **absent key** leaves the per-set weights
alone. It is also the first way to type a starting weight in this app at all — the plan
page previously did not even DISPLAY `weightKg`, although the LLM path has been able to
set one from the trainee's stated working weights since [[trainee-profile]] landed. An
unshown weight still syncs; a number that becomes a routine should be legible first.

## Verified running

Against a seeded MariaDB on 2026-08-11, in a real browser, via `scripts/cdp-drive.mjs`
(which gained a `fill:` step for React controlled inputs — assigning `.value` alone
leaves React's state untouched and the old value returns on the next render):

- A 4-day upper/lower plan generated from the form with **every** recommendation branch
  visible at once: add weight (102.5 kg), add reps (70 kg), layoff deload (40 kg),
  stall deload (90 kg), baseline from one session (30 kg), the non-transferable
  strength squat (140 kg), history with no load (pull-ups), and no history at all.
- "Use suggested loads (8)" pressed: 8 of the 10 suggestions written to every set of
  their exercises, the squat correctly left alone, confirmed in the stored plan JSON.
- The Edit form's new weight field opened prefilled, typed down to 97.5 kg, and cleared
  back to null — with the row then showing both the plan weight and what history says.

`scripts/seed-demo-history.mjs` builds that database in one command, so the next
session can re-run this rather than re-inventing the seed.
