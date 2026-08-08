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
MID-SESSION CHECKPOINT (work in progress, not a wrap-up). Architecture round 2 done
with the owner; now recording decisions into wiki/README, then scaffolding the
Next.js app. If this session died mid-way, the wiki pages below may be
half-written and the scaffold absent or uncommitted — re-verify before trusting.

## State reached
- Hevy API spec VERIFIED (Opus subagent read https://api.hevyapp.com/docs/); full
  OpenAPI spec pinned at `docs/hevy-openapi.json`. Key facts: rep ranges supported,
  no DELETE endpoints, routine limit 403, no catalog search (must cache), kg only,
  PUT = full replace. Being recorded in [[hevy-api]].
- New decisions with owner: self-hosted persistent server (vendor TBD, budget VPS,
  NOT Vercel/serverless); SQLite + Drizzle; Vercel AI SDK for LLM abstraction;
  create-then-PUT sync model; plan stored as JSON doc + normalized sync_links;
  minimal-plus edit scope; Hevy key plaintext in settings table; kg default unit
  (kg internal everywhere, lbs display-only opt-in). Being recorded in
  [[plan-pipeline]] and [[product-architecture]].

## Open questions / dissents
- LLM provider still deliberately undecided (via AI SDK).
- VPS vendor undecided (netcup likely); deploy = Docker + Next standalone output.

## Next steps
1. Finish wiki pages: [[hevy-api]], [[plan-pipeline]], update
   [[product-architecture]], [[hevy-platform]], index.
2. Update README.md (hosting, stack table, sync model, kg).
3. Commit docs; then scaffold `create-next-app` (TypeScript, npm), add
   `.env.example`, Drizzle, plan Zod schema, hevy/planner service stubs.
4. Verify: `npm run build`, wiki tests (tests/test_knowledge_wiki.py).
5. Still pending from bootstrap: lint pass of bootstrap pages against the repo.
