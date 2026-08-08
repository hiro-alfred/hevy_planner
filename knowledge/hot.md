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
**Scaffold → functional end-to-end site**, run as a milestone loop (one milestone per
iteration: implement → verify → commit → background review → next). Design is fixed by
[[plan-pipeline]] and [[hevy-api]]; this run is implementation, not redesign.

Milestone queue: (1) catalog refresh + candidate filtering, (2) settings page + Hevy
key action, (3) plan form → generate → preview → sync, (4) dashboard home,
(5) lint/cleanup pass, (6) optional deploy readiness.

**DONE: milestone 1** (catalog service, commit 4f6b2fd — see [[catalog-service]]).
**IN PROGRESS: milestone 2** — settings page + Hevy key entry.

## State reached
- Work happens on git worktree branch `worktree-e2e-build`, branched from `dev` at
  3413321. Merge back to `dev` when the loop finishes.
- Hevy API verified against the official spec, pinned at `docs/hevy-openapi.json`;
  facts + traps in [[hevy-api]] (no DELETE, routine-cap 403, no catalog search,
  kg only, rep ranges supported, superset_id/supersets_id quirk).
- Full core-flow design in [[plan-pipeline]]: 4-stage pipeline, JSON plan doc +
  sync_links data model, create-once-then-PUT sync, minimal-plus edit scope,
  plaintext key in settings table, kg default (lbs display-only later).
- Scaffold committed: create-next-app (TS, Tailwind, npm) + `src/lib/db/`,
  `src/lib/planner/schema.ts`, `src/lib/hevy/` (typed client; catalog/sync stubs),
  `drizzle.config.ts`, `.env.example`.
- DB wiring DONE: initial migration in `drizzle/`, auto-applied on every server boot
  via `src/instrumentation.ts` → `src/lib/db/migrate.ts`. Cold boot verified.
- `npm run build`, `npm run lint`, wiki tests: green at 3413321.

## Open questions / dissents
- LLM provider still undecided. Milestone 3 wires the AI SDK with the provider read
  from env AND a deterministic rule-based fallback, so the site works with no
  provider key. Final provider choice stays open.
- VPS vendor undecided; decision deferred until first deploy.

## Next steps
1. Milestone 1: implement `refreshCatalog` + `getCandidates` in
   `src/lib/hevy/catalog.ts` (page size 100, single-transaction upsert, no N+1).
2. Milestone 2: settings page + masked Hevy key entry + test-connection action.
3. Milestone 3: plan request form → generation → preview → sync.
4. Milestone 4: dashboard home page; milestone 5: lint/cleanup pass.
5. Optional milestone 6: `output: 'standalone'` + Dockerfile.
6. On finish: resolve all background-review findings, then full wrap-up
   (hot.md / [[log]] / [[index]]) and merge the worktree branch into `dev`.
