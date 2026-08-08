---
title: Trainee profile — the optional intake fields
aliases: [profile, intake, intake form, body metrics, current lifts]
tags: [subsystem, planner, form, llm]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources:
  [
    src/lib/planner/profile.ts,
    src/lib/planner/schema.ts,
    src/lib/planner/prompt.ts,
    src/lib/planner/generate.ts,
    src/app/plans/new/profile-fields.tsx,
    src/app/plans/new/field.tsx,
    src/app/plans/actions.ts,
    src/lib/planner/profile.test.ts,
  ]
---

# Trainee profile

The optional half of a plan request, added 2026-08-08 so plans are tailored rather
than generic. Feeds [[plan-generation]] through the prompt; every field is
skippable and a request with none of them produces exactly the plan the app made
before they existed.

## The governing rule

**A field exists only if something consumes it.** Each one below changes the
numbers, the exercise list, or the exclusions. Anything that merely looked
thorough was rejected — see the bottom of this page.

| Field | What it mechanically changes |
| ----- | ---------------------------- |
| `currentLifts` (squat/bench/deadlift/OHP) | Unlocks `weightKg`. Accessory loads are extrapolated from the anchors. |
| `injuries` | Hard exclusion of provoking patterns, forced substitution, raised rep floor, per-exercise caution in `notes`. |
| `bodyweightKg` | Bodyweight-relative loads; feasibility (pull-up versus pulldown). |
| `targetWeightKg` | Never sent raw — derives a phase. |
| `age` | Warm-up volume, joint-friendly variants, conservative at the extremes. |
| `focusMuscleGroups` (max 2) | Two to four extra weekly sets, and widens the candidate query. |
| `notes` | Free text: aversions, concurrent training, schedule. Constraints stated here are treated as hard. |

## Derived, never asked

`derivePhase` in `profile.ts` reads current versus target bodyweight into
`cut` / `maintain` / `bulk`, with a ±2 kg maintenance band. **The raw target
weight never reaches the model** — only the phase and its guidance sentence.
That is the only reason the field is collected.

Verified on a real generation: bodyweight 88, target 80 produced a plan titled
"4-Day Upper/Lower Strength — Cut" whose progression paragraph reads "hold onto
muscle and strength while losing fat; aggressive progression is not the
priority". The string `80` appears nowhere in the plan.

## Why everything is optional

Two independent reasons, and either alone would be sufficient:

1. **Stored requests are never re-parsed.** `getPlan` reads `plans.request`
   straight out of the JSON column (`lib/plans.ts`), so a required field would
   make the TypeScript type lie about every plan created before it existed.
2. **The fast path must survive.** The form's existing property — every field
   defaulted, generate works in five seconds — is worth more than any single
   new input.

Absent fields produce **no prompt line at all**, not "unknown". A list of blanks
invites the model to invent around them. `profile.test.ts` asserts a bare request
produces a prompt containing neither `undefined` nor `unknown`.

## Anchored starting weights

`planSetSchema.weightKg` existed from the beginning and was always null, because
the system prompt said "you do not know the trainee's current loads". Anchors are
what let that rule become conditional — the prompt now says leave it null
*unless* working weights were given.

> [!note] Ask for a top set of 5, never a 1RM
> A form field is not a reason for anyone to go and test a max. The label says
> "a comfortable top set of 5 — not a one-rep max", and the four lifts are
> anchors from which accessories are extrapolated, not an inventory.

Verified both directions on real generations: `{squat 120, bench 85, deadlift
160}` produced Bench Press 80 kg, Bent Over Row 70, Arnold Press 20, Curl 35,
Close-Grip Bench 60 — with close-grip correctly below flat bench. With no
anchors, every `weightKg` came back null.

## Focus groups widen candidates, not the day's identity

`focusMuscleGroups` is appended to the **candidate query** in
`loadDayCandidates`, deliberately NOT to the day template's own `muscleGroups`.
Without this, asking to emphasise forearms on a push/pull/legs split returns zero
forearm candidates — no template lists them — so the emphasis instruction would
have nothing to act on. Keeping the two apart means a Legs day can offer a curl
without being retitled. See [[catalog-service]] for why candidates are fetched
per day.

## Safety, and the honest line

The system prompt tells the model to treat reported injuries as hard exclusions,
raise the rep floor on affected lifts, add a practical caution to the affected
exercise's notes — and explicitly to **stay in its lane**: route training around
a reported problem, never diagnose it or prescribe rehab. The form carries one
static sentence, not a modal: plans are suggestions, not medical advice.

Verified: with "right shoulder impingement", a generated plan contained zero
overhead pressing across 21 exercises, with notes reading "stop if pinching in
shoulder" and "neutral grip to reduce shoulder stress".

> [!warning] The rules generator cannot read any of this
> `rules.ts` acts on none of the free text. A plan built by the deterministic
> fallback silently ignores injuries and notes, so the plan page now says so
> explicitly when the request carried either. A safety field that is quietly
> dropped is worse than one that was never offered.

## Traps

- **`step` on a number input is validated against `min` as its base.** The lift
  fields shipped as `min={1} step={2.5}`, which makes 120 a `stepMismatch` — and
  a form failing constraint validation **does not submit and shows nothing**. No
  error, no pending state. Every weight field now uses `step="any"`. Found only
  by typing a real number into the real form; lint, types, 103 tests and the
  build were all green over it.
- Empty optional inputs arrive as `""` and must become `undefined`, never `0` —
  a bodyweight of zero is a lie the model would act on.

## Rejected fields

**Height** was asked for by the owner and left out after analysis: nothing in
coaching practice or this pipeline consumes it, BMI is not a programming input,
and squat-stance lore is not derivable from height alone — the notes box carries
"deep squats feel awful" better. Also rejected: sex, body-fat percent, years
training (redundant with the experience enum), 1RM inputs, nutrition fields, a
PAR-Q medical checklist (theatre in a single-owner tool), tempo/warm-up/rest
preferences, and `preferredExerciseCount` — which would fight the session-length
budget that already derives it.
