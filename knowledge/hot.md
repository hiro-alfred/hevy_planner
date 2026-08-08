---
title: Hot — session working memory
aliases: [hot, working memory, where we left off]
tags: [meta, session]
type: meta
created: 2026-08-08
updated: 2026-08-08
sources: []
---

# Hot — where we left off

Working memory for **session continuity** ([[schema]]): every new session reads this
page FIRST and resumes from **Next steps**; every wrap-up OVERWRITES it with the
latest state. History belongs in [[log]] — this page holds only the CURRENT state.
Keep the four sections below; they are the template.

## Active task
**COMPLETE: scaffold → working end-to-end product.** All six planned milestones
are done, reviewed, and pushed on branch `worktree-e2e-build` (7 commits,
4f6b2fd..HEAD, branched from `dev` at 3413321). **Not yet merged into `dev`** —
that is the first thing to decide next session.

A user can now: enter a Hevy key on `/settings` → fetch the exercise catalog →
request a plan on `/plans/new` → get one (LLM if a provider key is set,
otherwise the deterministic generator) → preview it on `/plans/[id]` → sync it
to Hevy as a folder plus one routine per training day.

## State reached
- **Milestones**: catalog service ([[catalog-service]]), settings + key handling
  ([[key-handling]]), plan flow ([[plan-generation]], [[hevy-sync]]), dashboard,
  cleanup, deploy readiness ([[deployment]]).
- **Quality gates**: `npm run build`, `npm run lint`, 63 vitest tests, and the
  wiki tests all green. No file over 300 lines. Every route verified against a
  running server, including 404 and first-run empty states.
- **Verified end to end** on a clean database and on a 192-exercise seeded
  catalog: a 4-day upper/lower plan generated and rendered with zero
  validation violations.
- **Reviewed after every commit** (Fable subagents). Every finding was fixed,
  not deferred — see [[log]]. The write path to Hevy took the most iteration
  because nothing written there can be deleted.
- Migration `0001` adds `plans.hevy_folder_id` and a unique index on
  `sync_links(plan_id, day_index)`; it self-heals a database that already
  contains duplicate links. Migrations apply automatically on boot.

## Open questions / dissents
- **The sync path has never run against the real Hevy API.** It is covered by
  unit tests against a stub client, but a Hevy Pro key was not available. This
  is the single biggest untested surface — treat the first real sync as an
  experiment, on a throwaway Hevy account if possible.
- **The LLM path has never run against a live provider** either, for the same
  reason. The deterministic fallback is what has actually been exercised.
  Provider choice is still open (`anthropic` + `claude-opus-5` are only
  defaults; `@ai-sdk/anthropic` is installed).
- Generation uses `generateObject` in a server action, not `streamObject`
  behind a route handler as [[plan-pipeline]] specifies — deliberate
  simplification, recorded in [[plan-generation]]. Progressive preview is unbuilt.
- The "minimal-plus" editor from [[plan-pipeline]] (swap exercise, tweak
  sets/reps/rest) is unbuilt; the preview is read-only.
- Known unfixed gap in [[hevy-sync]]: if a create succeeds but its response is
  lost, the retry duplicates. Closing it needs a reconcile-by-title read.
- Exports that exist and are tested but nothing calls YET, kept as the surface
  their planned feature needs — reviewers keep re-flagging them, so recording
  the decision: `searchTemplates`, `getTemplateById`, `getAvailableEquipment`
  and `getCandidates`'s `includeNonRepBased` (swap-exercise picker);
  `getWeightUnit` / `setWeightUnit` (lbs display toggle). Delete them with the
  feature if it is dropped.
- No authentication. Exposing this to the internet needs an external auth gate
  ([[deployment]]).
- VPS vendor still undecided.

## Next steps
1. **Merge `worktree-e2e-build` into `dev`** (or open a PR) — the work is
   complete and pushed but still on its own branch.
2. Do a first real sync against a Hevy Pro account and see what the API
   actually does, especially the routine cap and PUT full-replace.
3. Set `LLM_API_KEY` and exercise the LLM path once; compare its plans against
   the deterministic ones and decide the provider.
4. Then pick up either the minimal-plus editor or streaming generation.
