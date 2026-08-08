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
Design phase COMPLETE ([[product-architecture]]); implementation not started. Next
milestone: scaffold the Next.js app.

## State reached
- Architecture decided with the owner: Next.js full-stack (TypeScript), personal
  single-user first, provider-agnostic LLM layer, Hevy API key entered in-app
  (settings page, server-side storage) with `.env` `HEVY_API_KEY` as optional
  fallback. Rationale in [[product-architecture]].
- `README.md` rewritten as the full design doc (written by a Sonnet subagent, owner
  reviewed the direction).
- `CLAUDE.md` gained a Code standards section: ≤300 lines of code per file, no N+1
  queries, no inline JS/CSS.
- `.gitignore` now ignores `.env`, `.env.local`, `.env*.local`.
- Nothing committed this session; working tree carries all the above changes.

## Open questions / dissents
- LLM provider deliberately undecided (abstraction via `LLM_PROVIDER`/`LLM_API_KEY`).
- Storage mechanism for the in-app Hevy key (file vs DB vs encrypted store) not yet
  chosen.

## Next steps
1. Scaffold the app: `create-next-app` (TypeScript), add `.env.example`.
2. Stub the two core services: plan generation (LLM abstraction) and Hevy sync.
3. Build the settings page + server-side route for Hevy key entry/storage.
4. Still pending from bootstrap: lint pass of bootstrap pages against the repo.
