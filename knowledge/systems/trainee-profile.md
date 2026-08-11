---
title: Trainee profile — the optional intake fields
aliases: [profile, intake, intake form, body metrics, current lifts]
tags: [subsystem, planner, form, llm]
type: subsystem
created: 2026-08-08
updated: 2026-08-11
sources:
  [
    src/lib/planner/profile.ts,
    src/lib/planner/prescription.ts,
    src/app/plans/request-form.ts,
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
| `phase` (cut/maintain/bulk) | A guidance sentence: hold load in a deficit, add it in a surplus. |
| `goalKind` | Sets the rep range and rest outright, instead of classifying the goal text. |
| `focusMuscleGroups` (max 2) | Two to four extra weekly sets, and widens the candidate query. |
| `notes` | Free text: aversions, concurrent training, schedule. Constraints stated here are treated as hard. |

## The 2026-08-11 review

An intake-parameter review recommended three changes; all three shipped, and
each overturned something recorded on this page. Together they take the form
from two number boxes that were guessed at to two questions asked outright.

**`age` is cut.** Its only consumer was a bare `- Age: 31` prompt line with no
instruction attached — unlike `phase`, which always carried its guidance
sentence. So whatever age changed came from the model's own assumptions about a
number, not from a rule this app wrote down; the table above claimed warm-up
volume and joint-friendly variants, and nothing implemented either. The cases
that genuinely change programming — slow recovery, cranky joints — are what
`injuries` and `notes` say in words, and the prompt has hard rules for those.
Reversible: re-adding the field is a form input and a prompt line, and this time
it would need a guidance sentence to earn them.

**`targetWeightKg` is replaced by `phase`.** The target weight was only ever
collected to derive `cut`/`maintain`/`bulk`, and it did that badly: it needed
BOTH weights, so a trainee who gave a bodyweight and no target got no phase at
all. One question replaces two numbers and cannot go silent for want of an
unrelated one.

**`goalKind` is added** — see the bug below.

> [!warning] Retired does not mean deleted
> `age` and `targetWeightKg` are gone from the form, the parser and the prompt,
> but they are **still in `planRequestSchema`**, because several actions
> re-parse a stored request in place — `parse({ ...row.request, … })` in the
> swap and rejection actions — and zod strips what it does not know. Dropping
> the keys would have deleted them from every plan made before that day, the
> first time its owner swapped an exercise. `resolvePhase` still reads
> `derivePhase` for those older requests, so a regenerate reproduces the plan it
> made the first time.

## The goal-classification bug, and the field that fixes it

The form's own default goal text, "Build muscle and get stronger", classified as
**strength**: `classifyGoal` returned on the first pattern to match, strength was
tested first, and "stronger" hit it. An untouched form therefore generated a 3–6
rep, 180-second plan while the box above it said "Build muscle". A bug on any
reading, live from the first build until 2026-08-11.

Fixed in two places, because either alone would be half a fix:

- the classifier now **counts** how many keywords each kind matches and takes
  the most evidence, with hypertrophy keeping ties as the documented safe
  default. "build" is no longer a hypertrophy keyword — it is a generic verb
  that "build strength" wears just as well;
- `goalKind` on the request **skips the classifier entirely** when set. The form
  defaults it to "Read it from what I wrote", so the free text keeps meaning
  something; picking one pins the rep range beyond argument.

A classifier is a guess by construction. Fixing this instance without offering a
way to say the thing outright would only move the next wrong guess somewhere
harder to notice.

## Phase, and what a derived one used to cost

`resolvePhase` returns the stated `phase`, or falls back to `derivePhase` —
current versus target bodyweight, ±2 kg maintenance band — for requests stored
before the enum existed. Either way **only the phase and its guidance sentence
reach the model**, never a weight.

Verified on a real generation, back when it was derived: bodyweight 88, target 80
produced a plan titled "4-Day Upper/Lower Strength — Cut" whose progression
paragraph reads "hold onto muscle and strength while losing fat; aggressive
progression is not the priority". The string `80` appears nowhere in the plan.
That evidence still stands — what changed is how the phase is arrived at, not
what it does once it has been.

Editing an old plan's request **migrates it**: the form shows the phase those
two weights implied, so the fork stores it as an answer instead of as two
numbers nobody sees any more.

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
- **A retired field cannot simply leave the schema.** Zod strips unknown keys,
  and the swap and rejection actions re-parse a stored request in place, so a
  removed key is silently deleted from old plans on the next swap. Retire from
  the form, the parser and the prompt; keep the key.

## Rejected fields

**Height** was asked for by the owner and left out after analysis: nothing in
coaching practice or this pipeline consumes it, BMI is not a programming input,
and squat-stance lore is not derivable from height alone — the notes box carries
"deep squats feel awful" better. Also rejected: sex, body-fat percent, years
training (redundant with the experience enum), 1RM inputs, nutrition fields, a
PAR-Q medical checklist (theatre in a single-owner tool), tempo/warm-up/rest
preferences, and `preferredExerciseCount` — which would fight the session-length
budget that already derives it.
