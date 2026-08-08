---
title: Log — wiki journal
aliases: [log, journal]
tags: [meta, journal]
type: meta
created: 2026-08-08
updated: 2026-08-08
sources: []
---

# Log

Append-only journal of ingests, queries, and lint passes ([[schema]]). Newest entries
at the bottom. When this page nears the 300-line cap, move the oldest entries to
[[log-archive]].

- 2026-08-08 — bootstrap: vault created; specials plus 6 initial pages synthesized
  from the repo (see [[wiki-bootstrap]] for decisions made). Wiki test passing.
- 2026-08-08 — design session: architecture decided with owner and recorded in
  [[product-architecture]]; README.md rewritten as the design doc (via Sonnet
  subagent), CLAUDE.md gained code standards, .gitignore now covers .env.
  [[project-overview]] updated (product vision no longer UNVERIFIED).
- 2026-08-08 — architecture round 2 + scaffold: Hevy OpenAPI spec fetched via Opus
  subagent and pinned (docs/hevy-openapi.json), verified facts in new [[hevy-api]];
  core-flow design in new [[plan-pipeline]] (create-once-then-PUT sync forced by
  no-DELETE + routine cap); [[product-architecture]] updated (self-hosted server
  not Vercel, SQLite + Drizzle, AI SDK, kg default); [[hevy-platform]] open
  questions answered. Next.js scaffold merged (create-next-app + npm), Drizzle
  schema + planner Zod schema + thin Hevy client written, catalog/sync/generate
  left as documented stubs. Build + lint + wiki tests green.
