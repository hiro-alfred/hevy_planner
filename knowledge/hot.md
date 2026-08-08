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
Architecture round 2 COMPLETE and scaffold in place ([[plan-pipeline]],
[[hevy-api]]). Next milestone: implement the pipeline services (catalog refresh
first — everything else depends on the cached catalog).

## State reached
- Hevy API verified against the official spec, pinned at `docs/hevy-openapi.json`;
  facts + traps in [[hevy-api]] (no DELETE, routine-cap 403, no catalog search,
  kg only, rep ranges supported, superset_id/supersets_id quirk).
- Full core-flow design in [[plan-pipeline]]: 4-stage pipeline, JSON plan doc +
  sync_links data model, create-once-then-PUT sync, minimal-plus edit scope,
  plaintext key in settings table, kg default (lbs display-only later).
- Hosting: self-hosted persistent server, vendor TBD (netcup likely; owner's
  Raspberry Pi viable). Locked: Docker + Next `output: 'standalone'` (standalone
  flag NOT yet set in next.config.ts), external auth gate needed when exposed.
- Scaffold merged and committed: create-next-app (TS, Tailwind, npm), deps
  drizzle-orm/better-sqlite3/zod/ai(+drizzle-kit dev). Written: `src/lib/db/`
  (schema + client), `src/lib/planner/schema.ts` (plan Zod model),
  `src/lib/hevy/` (typed client; catalog/sync as throwing stubs),
  `src/lib/planner/generate.ts` (stub), `drizzle.config.ts`, `.env.example`.
- DB wiring DONE: initial migration in `drizzle/` (`npm run db:generate` for
  future schema changes), auto-applied on every server boot via
  `src/instrumentation.ts` → `src/lib/db/migrate.ts` — no manual step. Cold-boot
  verified: fresh `npm start` creates data/hevy-planner.sqlite with all tables.
  `requirements.txt` added (pytest only; app deps stay in package.json).
- `npm run build`, `npm run lint`, wiki tests: all green. Default
  create-next-app home page still in place.

## Open questions / dissents
- LLM provider undecided → generate.ts stays a stub until picked (then add the
  provider package, e.g. @ai-sdk/anthropic).
- VPS vendor undecided; decision deferred until first deploy.

## Next steps
1. Implement catalog refresh + candidate filtering (`src/lib/hevy/catalog.ts`).
2. Settings page + server action for Hevy key entry (masked display, never echoed).
3. Then: plan request form → generate (needs provider choice) → preview → sync.
4. Set `output: 'standalone'` in next.config.ts + Dockerfile when deploy nears.
5. Still pending from bootstrap: lint pass of bootstrap pages against the repo.
