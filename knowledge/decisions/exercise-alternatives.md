---
title: Exercise alternatives — the swap feature
aliases: [alternatives, swap, swap exercise, other alternatives]
tags: [decision, planner, ui, sync, design]
type: design
created: 2026-08-08
updated: 2026-08-11
sources:
  [
    src/lib/planner/alternatives.ts,
    src/lib/planner/alternatives.test.ts,
    src/lib/planner/muscle-balance.ts,
    src/lib/planner/muscle-balance.test.ts,
    src/lib/hevy/catalog.ts,
    src/lib/planner/schema.ts,
    src/lib/planner/validate.ts,
    src/lib/hevy/sync.ts,
    src/app/plans/[id]/swap-actions.ts,
    src/app/plans/[id]/exercise-swap.tsx,
    src/app/plans/[id]/rejected-exercises.tsx,
    src/app/plans/[id]/plan-preview.tsx,
  ]
---

# Exercise alternatives — the swap feature

> [!note] BUILT 2026-08-11, to this design
> This page was written as a design ahead of implementation; the build followed
> it and the page now describes shipped code. Owner brief was: an exercise the
> user dislikes should be replaceable from the preview, repeatedly, without ever
> repeating itself. What actually shipped, and the two places it deviates, are
> in [[#What shipped]] at the foot of the page. **Not yet exercised by a human
> against a real plan** — unit tests cover the pure half and the pool query;
> nobody has clicked it.

This fills in the half of "Edit scope: minimal-plus — swap-exercise (catalog
picker)" that [[plan-pipeline]] already closed as a decision. Half the
scaffolding exists: `catalog.ts` ships `searchTemplates()` commented "for the
swap-exercise picker" and `getTemplateById()` "used by the preview UI after an
exercise swap".

## Decisions

**Alternatives come from the catalog, never from the LLM.** The load case is
someone clicking "show me something else" three times in a row — browsing
tolerates ~100 ms, not the 30–60 s (in practice 1–3.5 min, measured) an LLM call
costs. It can also fail, and it can hallucinate an id, which here is not
cosmetic: an unknown id is a sync-time landmine. The context an LLM would add is
already a WHERE clause — same primary muscle group, the trainee's equipment,
rep-based type, not already in the day, not previously rejected. Against 452
local rows there is nothing for a model to know that the columns do not say.

**One fetch per picker-open, paged client-side.** The action returns the whole
ranked pool (~30 rows); "more alternatives" advances an offset. So the first
click costs one local query and every later click costs nothing. Ranking is
against the DAY rather than against the outgoing exercise alone: see
[[#Ranking against the day]], which replaced the original
primary-then-secondary ordering on 2026-08-11.

**A swap is a permanent rejection, per plan** (owner's decision, 2026-08-08).
The swapped-out template id is appended to a new optional
`excludedExercises: z.array(z.string()).max(100).optional()` on
`planRequestSchema`. It lives in the **request**, not the plan document, because
the request is what `regeneratePlanAction` re-reads — putting it in the plan
would mean `savePlan` vaporises it on the next regenerate, which is precisely
the failure being prevented. JSON column, so **no migration**.

Options merely browsed past are **not** recorded. Scrolling past an exercise is
not a verdict on it, and treating it as one would starve the pool within a few
sessions.

> [!note] Gap closed in the build
> The design flagged that nothing could view or clear `excludedExercises`, so
> the first accidental swap would be permanent. `rejected-exercises.tsx` ships
> the list with a per-row Restore and a Clear all, in the same pass. Restoring
> returns an exercise to the candidate POOL; it deliberately does not put it
> back into the plan, which would undo a swap the user may since have built on.

Exclusions are **per plan, not global**. Promoting them to a global preference
later is easy; the reverse is not.

## Ranking against the day

Added 2026-08-11, on the owner's brief: a recommendation must not be
**redundant**. Two failures, both live in the first build, both fixed here.

1. **It must not remove a portion the day was meant to get.** The pool query
   matches primary OR secondary muscle, so swapping a bench press could return a
   close-grip press that merely lists chest as a secondary — and a day whose only
   chest work was that bench keeps half of it.
2. **It must not work a muscle unnecessarily.** Nothing looked at the
   neighbouring exercises, so a chest fly could be replaced by a triceps-heavy
   press on a day already running two triceps movements.

`muscle-balance.ts` answers both by measuring the DAY. Each exercise contributes
its working sets (warm-ups are not volume) to its primary muscle at weight 1 and
to each secondary at **0.5** — coarse, but the catalog carries nothing finer.
That yields `base` (the day without the outgoing exercise), `gap` (what the
outgoing exercise contributes, i.e. what the swap owes back) and `before`.

Each candidate gets two numbers, one per failure:

- **coverage** — the share of `gap` it puts back. A chest press for a chest
  press restores all of it; a triceps movement listing chest as a secondary
  restores half of the chest. This is rule 1 as a number rather than a filter.
- **waste** — of the stimulus it adds BEYOND `gap`, how much lands on muscles
  the rest of the day already covers, discounted by a `need` hyperbola (1.0 at
  no coverage, 0.5 at four weighted sets, never zero). This is rule 2. It is why
  on a triceps-saturated day a plain fly beats a close-grip press even though
  both restore the chest work in full.

Sort keys: **deficit**, then **surplus**, then `coverage − waste` bucketed to
0.05, then the outgoing exercise's own equipment, then `EQUIPMENT_RANK`, then
title. The two flags outrank the score because they are not preferences — they
are the failures. Deficit fires when a muscle keeps under 75% of coverage it had
(ignoring incidental coverage under one weighted set); surplus fires when the
swap ADDS load to a muscle already past six weighted sets, so a day that was
already triceps-heavy before the swap is not held against an option that changes
nothing about it.

**Weak fits are ranked last and labelled, never hidden** (owner's decision). A
restrictive equipment list can leave nothing but imperfect options, and an empty
picker helps nobody — so each such row carries one plain sentence: "Leaves
shoulders untrained on this day", "Leaves this day short on chest", "This day
already has plenty of triceps".

The day's intended muscles are read from **the exercises the day currently
holds**, not from the [[plan-pipeline]] split template. `planDaySchema` stores
only a title and exercises, so the split would have to be re-derived from the
request and matched by day index — which goes stale the moment a day is edited,
and LLM-generated days need not follow the template's order anyway.

The old primary-versus-secondary sort key is gone because these keys subsume it,
and they demote for the real reason instead of by proxy. Cost is one extra batch
query per picker-open (`getTemplatesByIds` over the day's ids), issued in
parallel with the pool query — not per exercise, which would be the N+1 the
project rules ban.

## The substitution rule

The replacement inherits the outgoing exercise's `sets` array and `restSeconds`
**verbatim**. Only `weightKg` and `notes` reset to null — a load anchored to a
barbell bench does not transfer to a machine, and an injury caution written for
one movement ranges from useless to dangerous on another.

This makes the session-length contract safe *by construction* rather than by
re-checking: `sessionSeconds()` depends on exactly `sets.length` and
`restSeconds` ([[plan-generation]]), so a day's computed length is identical
before and after a swap. **A swap can never create a ±20% violation.**

Do not auto-adjust rest for a different movement class. That would silently
change session maths the user already accepted, and it duplicates the
per-exercise rest tweak [[plan-pipeline]] scopes separately.

## Sync interaction

A swap writes `plans.plan` and `plans.request`. **It touches nothing else.**
Every existing mechanism then does its job unmodified: the day's content hash
stops matching `sync_links`, the chip flips to "Changes pending", and the next
**explicit** sync takes the PUT branch against the stored routine id — zero
POSTs, zero quota consumed, nothing stranded. See [[hevy-sync]].

What must not happen, each a permanent-damage path given no-DELETE and the
routine cap:

- **No auto-sync after a swap.** Never-auto-push is a closed decision and every
  Hevy write is irreversible.
- **No day-level identity changes.** The swap is strictly in place at
  `(dayIndex, exerciseIndex)`. Reordering or removing *days* would shift the
  `dayIndex` → `sync_links` correspondence and POST a new routine while
  stranding the old one.
- **No id the catalog does not know.** The picker cannot produce one, but the
  action must not trust the client: re-verify with `getTemplateById` and check
  the type is rep-based. `searchTemplates` filters neither.

Fine-grained swap is therefore a **sync-safety** feature, not only a UX one: it
is the repair path that does not rebuild days, so it reduces how often anyone
reaches for Regenerate on a capped, delete-less API.

## Shape

New pure module `src/lib/planner/alternatives.ts` (unit-testable like
`rules.ts`), two server actions, and one client island
`src/app/plans/[id]/exercise-swap.tsx` receiving only serializable scalars —
`plan-preview.tsx` stays a server component. Inline expansion under the row, not
a modal: the judgement "does this fit *this day*" depends on seeing the
neighbouring exercises, and a modal severs that. Each option shows muscle-group
and equipment chips, which *are* the explanation — they are the query's WHERE
clause made visible.

Exhaustion is real (bodyweight-only calves might be a pool of two). Say so
plainly and offer `searchTemplates` as the escape hatch; **never loop back to
the start**, which reads as broken.

`getCandidates` gains `excludeIds?: string[]`, `validatePlan` gains a rule that
an excluded exercise is a violation (the model only *requests* id compliance in
`json_object` mode, so the validator is the real enforcement), and the
unfillable-day error gains a clause naming exclusions as a possible cause.

Concurrency: the read-modify-write runs inside `withPlanLock`, with an
`expectedTemplateId` check so a second tab gets a clean refusal instead of a
silent clobber.

## What shipped

Matching the design: `alternatives.ts` (pure — ranking, `substitute`,
`applySwap`), `excludedExercises` on `planRequestSchema` (JSON column, **no
migration**), `excludeIds` on `getCandidates`, the rejection rule in
`validatePlan`, the exclusions clause on the unfillable-day error, two actions
in `swap-actions.ts` under `withPlanLock` with the `expectedTemplateId` check
and an `getTemplateById` re-verification of the client's id, and the inline
`exercise-swap.tsx` island taking only scalars so `plan-preview.tsx` stays a
server component.

The session-length claim is held down by a test rather than asserted: a swap
across movement classes is checked to leave `sessionSeconds` on every day
byte-identical, which is what makes "a swap can never create a ±20% violation"
true by construction.

Two deviations, both small:

- **Page size is 5, pool size 40** (the design said "~30 rows"). One query per
  picker-open still; the pool is simply the same `getCandidates` limit the
  generator uses.
- **The rejection cap is enforced, not silently truncated.** At 100 rejections
  the action refuses with a message pointing at the Restore list, rather than
  dropping the oldest — which would quietly resurrect an exercise the user had
  rejected, the exact failure the whole feature exists to prevent.

Third-party styling note: the picker needed a third stylesheet
(`src/app/ui-swap.css`), because `ui-controls.css` is at the 300-line file cap
([[ui-design-system]]).

The day-balance ranking landed later the same day, in `muscle-balance.ts` (pure,
like the rest of the swap's arithmetic) plus a third field on `Alternative`:
`caveat`, the one sentence a weak option carries into the picker. Twelve tests
cover it, including both redundancy cases stated as their own assertions. Still
unclicked by a human, like everything else here.

## Rejected

LLM-per-swap (latency, cost, failure, hallucinated ids); hybrid catalog-then-LLM
re-rank (the list reorders under the cursor); "regenerate this day" as the
mechanism (replaces a whole day when one movement was objected to); rejections
in the plan JSON (destroyed by regenerate); a rejections table (nothing
relational queries it, and it splits the request's reproducibility contract
across two homes); excluding browsed-past options; a modal; auto-adjusted rest;
auto-sync; shipping the filtered catalog to the client.

On the day-balance ranking specifically: **hiding** weak fits rather than
sinking and labelling them (a short pool can hold nothing better, and an empty
picker helps nobody); reading the day's intended muscles from the split template
by day index (stale after any edit); and a plain deviation metric — scoring
candidates by how little they move the day's profile — which cancels the rest of
the day out of the arithmetic entirely and so cannot express "unnecessarily".
