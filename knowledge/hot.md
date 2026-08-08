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
The app **runs locally and works** against real MariaDB and the real Hevy API.
`dev` @ `7bce793`, tree clean, pushed. Two stages remain unexercised: **LLM
generation** (no key configured) and **sync to Hevy** (never written to the live
account). Everything else in the pipeline has been run for real.

## State reached
- **MariaDB replaced SQLite** ([[mariadb-migration]]) after merging the
  `worktree-e2e-build` branch into `dev`, so the conversion happened once
  against the full app. Verified end to end: 90 tests green against a real
  server, boot migration builds all tables, every route answers.
- **Catalog works against the live API**: 452 templates cached, all 9 equipment
  categories. Two spec-vs-reality bugs fixed — the API sends `equipment`, not
  the spec's `equipment_category`, and the rep-based type list had been guessed
  wrong. Both are traps in [[hevy-api]]; the second had been silently excluding
  every assisted pull-up and weighted dip from candidates.
- **Hevy key is encrypted at rest** (AES-256-GCM, [[key-handling]]), reversing
  the old plaintext decision because the MariaDB move made database-only
  compromise a real event. The existing key was upgraded in place at boot.
- **DeepSeek wired as the LLM provider** ([[plan-generation]]), default
  `deepseek-v4-pro`. Not yet exercised — no key configured.
- Green: `npm run build` incl. TypeScript, `npm run lint`, 90 vitest tests,
  14 wiki tests.

## Open questions / dissents
- **Unproven: LLM generation.** No `LLM_API_KEY`, so every plan so far came from
  the deterministic rule-based generator. Also note `@ai-sdk/deepseek` does not
  set `supportsStructuredOutputs`, so `generateObject` runs in `json_object`
  mode, which DeepSeek documents as occasionally returning empty content —
  expect the odd silent fallback to rules and check `source` before judging it.
- **Unproven: the live Hevy write path.** Sync has only ever run against a stub.
  It is irreversible — no DELETE endpoint and a routine cap ([[hevy-api]]) — so
  the first real sync must be a 2-day plan, not a 6-day split.
- **Unproven: the container path.** No Docker daemon on this machine (firmware
  virtualization is on, WSL2 has no distro), so `docker compose up`, the
  `depends_on` healthcheck ordering and the boot-migration retry are
  reasoned-about only ([[deployment]]). Local runs MariaDB 12.3 native; the
  compose files pin 11.4 LTS.
- **`data/` still holds the pre-migration SQLite file, which likely contains the
  Hevy key IN PLAINTEXT.** This partly defeats [[key-handling]]. Gitignored, not
  deleted — it is the owner's data and their call. Flagged twice; still there.
- Correction kept on the record: the original justification for
  `src/lib/db/json-column.ts` (that mysql2 returns MariaDB JSON unparsed) did
  NOT reproduce — mysql2 3.23.2 parses it via MariaDB 10.5+ extended metadata.
  The file is kept as version-independence, not as a fix for a live bug.
- Hosting undecided (netcup leaning). No backup story yet; losing `sync_links`
  is the expensive failure, because re-sync would then create DUPLICATE Hevy
  routines that cannot be deleted.
- `.claude/worktrees/e2e-build` is fully merged and redundant; safe to
  `git worktree remove`.

## Local dev setup (this machine)
MariaDB 12.3.2 installed natively via `winget install MariaDB.Server` and
running as a Windows service; root and app user `hevy` both use the throwaway
password `hevydev`. The `mariadb` CLI is NOT on PATH (it lives in
`C:\Program Files\MariaDB 12.3\bin\`) — the service runs regardless.
`npm run dev` serves **port 3001**, because another process holds 3000.
Tests need the server: `TEST_DATABASE_URL="mysql://root:hevydev@127.0.0.1:3306" npm test`.

> [!warning] `.env` must never be read (CLAUDE.md)
> `DATABASE_URL` and `SETTINGS_ENCRYPTION_KEY` were appended blind. Append new
> keys rather than rewriting the file, and only with names that cannot already
> exist in it.

## Next steps
1. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, then generate
   one plan and confirm the preview reports an LLM plan rather than a rules
   fallback. This is the gap between "runs" and "does the thing".
2. **Sync one 2-day plan to Hevy** and check the routines land correctly. First
   write to the live account; irreversible.
3. Offer to delete `data/` (plaintext key leftover) — ask, do not assume.
4. Deploy: prove `docker compose up`, add a `mysqldump` backup cron, pick the
   VPS. See [[deployment]] for what is untested.
