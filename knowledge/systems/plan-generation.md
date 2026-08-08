---
title: Plan generation — two generators behind one door
aliases: [generation, generator, plan generation, rule-based generator, llm generation]
tags: [subsystem, planner, llm, training]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [src/lib/planner/generate.ts, src/lib/planner/rules.ts, src/lib/planner/prescription.ts, src/lib/planner/split.ts, src/lib/planner/validate.ts, src/lib/planner/provider.ts, src/lib/planner/planner.test.ts]
---

# Plan generation

Stage 3 of the [[plan-pipeline]]. `generatePlan(request)` in
`src/lib/planner/generate.ts` is the single entry point; behind it sit two
generators and one validator.

> [!important] The rule-based generator is not a degraded mode
> It is what makes the product work with no LLM key configured, and it is the
> reference the LLM's output is measured against. Same request in, same plan
> out — no randomness anywhere. The LLM writes better plans; the rules always
> write one.

## The pipeline inside generatePlan

1. **Split → days** (`split.ts`). The requested split expands to exactly
   `sessionsPerWeek` days, each carrying the muscle groups it trains. `auto`
   picks by frequency: ≤2 full body, ≤4 upper/lower, else push/pull/legs.
   Repeated titles are suffixed A/B so Hevy routine names stay distinct.
2. **Candidates per day** (via [[catalog-service]]). One query per training day,
   never one per plan — a plan-wide query lets `limit` starve a muscle group.
3. **Generate.** LLM if `LLM_API_KEY` is set, otherwise the rules.
4. **Validate** (`validate.ts`) and, for the LLM path, retry once with the
   violations appended. A second failure returns the attempt WITH its
   violations — the preview shows them rather than pretending the plan is fine.

## The volume model (`prescription.ts`)

Goal text is classified (strength / hypertrophy / endurance) into a rep range
and rest. Then a session's time budget is split across two dials:

```
setSeconds   = 45s work + that exercise's rest
exerciseCount = clamp(floor(total / (3 x setSeconds)), 3, cap-by-experience)
setsPerExercise = clamp(round(total / (exerciseCount x setSeconds)), 2, 8)
```

> [!warning] Both dials have to move
> The first implementation capped exercises only. At 8 exercises x 3 sets a
> 60-minute session came to 42 minutes — so **every** 60+ minute plan failed its
> own length validation. Exercises fill the time up to the experience cap, then
> sets absorb the remainder. A test sweeps every goal x experience x duration
> combination and asserts each lands within the ±20% tolerance.

The final set's rest **is** counted (it is the changeover to the next exercise).
That matches the formula [[plan-pipeline]] specifies, so the generator and the
validator agree by construction rather than by coincidence.

## Validation rules

Zod guarantees the shape; `validatePlan` checks what Zod cannot: every
`exerciseTemplateId` resolves in the cached catalog, the day count matches the
request, each session lands within ±20% of the requested length, and no rep
range is reversed. Violations are plain sentences because they are fed straight
back to the model on the retry.

The plan detail page re-runs validation on every render instead of storing a
verdict — the catalog can change under a saved plan, and a stale "looks fine"
would be worse than none.

## Provider wiring

`provider.ts` reads `LLM_PROVIDER` / `LLM_MODEL` / `LLM_API_KEY` and resolves an
AI SDK model, importing the provider package dynamically so a second provider
never becomes a hard build dependency. Default provider is `anthropic`, default
model `claude-opus-5`. No key configured → the rules generate, and the preview
says so. The provider call failing → the rules generate, and the preview says
that too; the provider's own error text is never repeated to the user (see
[[key-handling]]).

> [!note] Deviation from the design: no streaming yet
> [[plan-pipeline]] specifies `streamObject` behind a route handler so a 30–60s
> generation fills the preview progressively. This is `generateObject` inside a
> server action instead — the whole plan lands at once after a pending state.
> Simpler, and correct; the progressive preview is still open work.
