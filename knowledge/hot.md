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
Storage moved from SQLite to **MariaDB** at the owner's request
([[mariadb-migration]]). Code, config, docs and wiki are done; the DB-backed
test suites are the one thing still unrun.

## State reached
- `worktree-e2e-build` (8 commits: catalog, settings, plan flow, dashboard, sync
  fixes, Docker, plan lock) fast-forward **merged into `dev`** first, so the
  conversion happened once against the full app instead of twice.
- MariaDB conversion complete: `mysql2` replaces `better-sqlite3`,
  `drizzle-orm/mysql-core` schema (varchar PKs, `mysqlEnum`, `boolean`,
  ISO-8601 `varchar(32)` timestamps), pooled async client, single squashed
  `drizzle/0000_brainy_chat.sql`. Per-dialect fixes and their reasons are
  tabulated in [[mariadb-migration]].
- `src/lib/db/json-column.ts` is load-bearing: drizzle's mysql `json()` has no
  `mapFromDriverValue`, and MariaDB reports JSON as LONGTEXT, so every JSON
  column would silently return an unparsed string. Do not "simplify" it away.
- Boot migration now retries transient connect errors for 60s
  ([[deployment]]) — compose `depends_on` alone does not cover restarts.
- Two compose files: `docker-compose.yml` (app + db, no published DB port) and
  `docker-compose.test.yml` (tmpfs MariaDB on 3307). Tests take a database per
  file via `src/test/database.ts` ([[testing-setup]]).
- Green: `npm run build` incl. TypeScript, `npm run lint` (also fixed eslint
  linting nested worktree `.next/` output), `drizzle-kit generate`. 63 tests
  were green on SQLite immediately before the change.

## Open questions / dissents
- **Unverified:** no Docker daemon and no MariaDB on this machine, so `npm test`
  has not run against a real server. Translated SQL was checked by compiling it
  through drizzle's mysql dialect instead — see the verification callout in
  [[mariadb-migration]].
- Ops cost was flagged to the owner before starting (second container, tests now
  need a server) and the change was confirmed anyway. Recorded, not re-litigated.
- LLM provider still unpicked; VPS vendor still undecided.
- `data/` still holds the old SQLite file. Left in place and gitignored because
  it may contain a stored Hevy key — the owner should delete it by hand.
- Leftover worktree at `.claude/worktrees/e2e-build` is now fully merged and
  redundant; safe to `git worktree remove`.

## Next steps
1. On a machine with Docker: `npm run test:db:up && npm test`, then
   `docker compose up --build` and load every route. Fix whatever the first real
   MariaDB run surfaces and clear the warning in [[mariadb-migration]].
2. Pick the LLM provider so `generate.ts` stops falling back to the rule-based
   generator.
3. Decide the VPS vendor and do a first real deploy.
