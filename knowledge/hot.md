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
([[mariadb-migration]]) and now **verified end to end locally**: 63/63 tests
against a real server, all routes answering, boot migration applied. The
container path (`docker compose up`) is the remaining unproven piece.

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
- **Correction on the record:** the original justification for
  `src/lib/db/json-column.ts` — that mysql2 returns MariaDB JSON unparsed —
  did NOT reproduce. Measured: column type 252 (LONGTEXT, as predicted) but
  mysql2 3.23.2 parses it anyway via MariaDB 10.5+ extended metadata, on both
  protocols. Drizzle's built-in `json()` would have worked here. The custom
  column is kept as version-independence, not as a fix; comments, wiki and log
  corrected.
- **Still unverified: the container path.** No Docker daemon here (firmware
  virtualization is available, WSL2 has no distro), so `compose up`, the
  healthcheck ordering, and the boot-migration retry are untested. Local dev
  runs MariaDB 12.3 natively while the compose files pin 11.4 LTS.
- Ops cost was flagged to the owner before starting (second container, tests now
  need a server) and the change was confirmed anyway. Recorded, not re-litigated.
- LLM provider still unpicked; VPS vendor still undecided.
- `data/` still holds the old SQLite file. Left in place and gitignored because
  it may contain a stored Hevy key — the owner should delete it by hand.
- Leftover worktree at `.claude/worktrees/e2e-build` is now fully merged and
  redundant; safe to `git worktree remove`.
- Port 3000 was occupied by another process, so `npm run dev` served 3001.

## Local dev setup (this machine)
MariaDB 12.3.2 installed natively via `winget install MariaDB.Server`; root
password and an app user `hevy` both `hevydev` (throwaway, local only).
`DATABASE_URL` was **appended** to the existing `.env` — that file is never read
per CLAUDE.md, so the append was blind but safe (`DATABASE_URL` is a new key;
the old one was `DATABASE_PATH`). Tests:
`TEST_DATABASE_URL="mysql://root:hevydev@127.0.0.1:3306" npm test`.

## Next steps
1. Pick the LLM provider so `generate.ts` stops falling back to the rule-based
   generator — the biggest gap between "runs" and "does the thing".
2. Exercise the real flow by hand: enter a Hevy key on `/settings`, refresh the
   catalog, generate a plan, sync it. Nothing has touched the live Hevy API yet.
3. Prove the container path when Docker exists (or on the deploy host), and
   clear the warning in [[deployment]].
4. Decide the VPS vendor and do a first real deploy.
