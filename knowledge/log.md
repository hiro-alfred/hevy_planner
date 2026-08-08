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
- 2026-08-08 — milestone 1 (catalog): `src/lib/hevy/catalog.ts` implemented
  (fetch-then-write refresh, single-transaction upsert + prune, one-query
  candidate filter incl. json_each secondary-muscle match), spec enums extracted
  to `constants.ts`. vitest added as the app-side runner ([[testing-setup]]);
  13 tests caught two real bugs (bare `0` in ORDER BY read as a column ordinal;
  Windows SQLite file lock). New [[catalog-service]] page. Build, lint, vitest,
  wiki tests green.
- 2026-08-08 — milestone 1 review (Fable, commit 4f6b2fd): no blockers. Acted on
  the truncated-walk finding — a `page_count` past the safety cap now aborts
  instead of pruning everything beyond it. Refresh also switched from
  upsert-then-prune-by-timestamp to clear-then-insert in one transaction, after
  a test caught two same-millisecond refreshes sharing a `fetchedAt`. Deferred
  finding: candidate lists are not balanced per muscle group, so generation
  should call `getCandidates` once per training day (noted for milestone 3).
- 2026-08-08 — milestone 2 (settings): `/settings` page with masked key entry,
  test-connection and catalog-refresh actions; `src/lib/settings.ts` +
  `src/lib/hevy/session.ts` as the single key path; nav shell added to the
  layout. New [[key-handling]] page. Verified against a running server: the
  stored key appears 0 times in the rendered HTML, only its last 4 do.
