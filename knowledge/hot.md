---
title: Hot — session working memory
aliases: [hot, working memory, where we left off]
tags: [meta, session]
type: meta
created: 2026-08-08
updated: 2026-08-11
sources: []
---

# Hot — where we left off

Working memory for **session continuity** ([[schema]]): every new session reads this
page FIRST and resumes from **Next steps**; every wrap-up OVERWRITES it with the
latest state. History belongs in [[log]] — this page holds only the CURRENT state.
Keep the four sections below; they are the template.

## Active task
Nothing in flight. Two rounds landed today, both green, **neither clicked by a
human**:

1. `16c8ce3` — [[exercise-alternatives]] (the swap feature, previously
   designed-not-built) and the [[plan-generation]] prompt/output compaction.
   The prompt work cannot be timed without an `LLM_API_KEY`, so its latency
   gain is inferred from measured token counts, not observed.
2. [[plan-editing]] — per-exercise set/rep/rest editing (completing the
   minimal-plus scope), request editing that **forks rather than overwrites**
   (owner's call, 2026-08-11), and `/routines`, a read-only view of what is
   actually in the Hevy account. Rationale, the Hevy cost of forking, and why
   foreign routines cannot be edited all live on that page. One migration,
   `0001` — additive, nullable, and its upgrade path is covered by the new
   `src/lib/db/migrate.test.ts`.

**An open decision is waiting on the owner**: a review of the intake parameter
set ([[trainee-profile]]) recommends CUTTING `age`, reshaping `targetWeightKg`
into an asked-for `phase` enum, and adding an explicit `goalKind` override.
Nothing was changed — it overturns recorded decisions, so it is the owner's
call. The review also found a live bug worth fixing either way: the plan form's
own default goal text, "Build muscle and get stronger", matches the STRENGTH
regex in `classifyGoal` before the hypertrophy one, so an untouched form
generates a 3–6 rep / 180 s strength plan while saying "Build muscle".

## State reached
- **Swap, editing, forking and the Hevy read-back are all built**
  ([[exercise-alternatives]], [[plan-editing]], [[plan-generation]]). Lint,
  `tsc`, **144 vitest tests** (up from 103), 14 wiki tests and `next build`
  green. None of it is human-verified: no page has been clicked, `/routines`
  has never run against a real account, and the latency claim rests on measured
  token counts rather than a timed generation.
- **The database needs a migration on next boot** (`0001`, adding
  `plans.derived_from_plan_id`). It is additive and nullable, and
  `migrate.test.ts` proves it applies to a populated database without data
  loss — but it has only ever run against the throwaway server on 3307, never
  the owner's real database.
- **The dev server is reachable from the LAN.** `next dev` 403s `/_next/*` and the
  HMR upgrade for any origin but its own host, so `next.config.ts` now carries
  `allowedDevOrigins: ["192.168.0.*"]`. Verified by re-requesting a dev asset with
  the LAN `Origin`: 404, not 403. Dev-only — the standalone image is unaffected.
- [[log]] was rotated: the first 107 lines (the SQLite-era milestone run and its
  reviews) now live in [[log-archive]], leaving room under the 300-line cap.
- Earlier: **Graphite is live across all four screens** and was screenshotted
  running — dashboard (all four sync states), `/plans/[id]`, `/plans/new`,
  `/settings`. Lint, `tsc`, 103 vitest tests, 14 wiki tests and `next build` green.
- **Screenshots have no browser extension and no Playwright here.** The working
  tool is `chrome --headless --disable-gpu --screenshot=… --window-size=W,H`
  from `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`, plus
  `--force-prefers-reduced-motion` — without it the capture freezes mid-reveal
  with every stat counter still reading 0.
- Earlier: the **container path is proven** ([[deployment]]) — `docker compose
  up -d --wait` brings both services healthy, the boot migration builds the
  schema on an empty volume, and 103/103 tests pass against the pinned MariaDB
  11.4.

## Open questions / dissents
- **BLOCKER: `.env` `DATABASE_URL` does not work.** A fresh `npm run dev` dies
  with `Access denied for user 'hevy'@'localhost' (using password: YES)`. This
  is the drift already logged on 2026-08-08 — a long-lived server kept a working
  connection while the file changed under it. The redesign was therefore
  screenshotted against a **throwaway** database, not the real one. The owner
  must fix the `hevy` password in `.env` (never readable from a session).
- **Unproven: LLM generation.** No `LLM_API_KEY` anywhere yet. Note that
  `@ai-sdk/deepseek` does not set `supportsStructuredOutputs`, so
  `generateObject` runs in `json_object` mode, which DeepSeek documents as
  occasionally returning empty content — check `source` before judging a plan.
- **Unproven: the live Hevy write path.** Sync has only ever run against a stub,
  and it is irreversible — no DELETE endpoint, plus a routine cap
  ([[hevy-api]]). The first real sync must be a 2-day plan.
- **Unproven: the boot-migration retry.** The app has never started against a
  database that was not already accepting connections, so the 60s
  connection-phase retry in `src/lib/db/migrate.ts` has not fired.
- **A node process is listening on 3000** — most recently `next dev`, but the
  compose stack from 2026-08-09 also published 3000 against a fresh empty volume
  and is not the owner's working instance (no Hevy key, no catalog).
  `docker compose down` stops it; add `-v` to also drop `hevy_planner_db-data`.
  The two collide, so only one can hold the port.
- **`data/` still holds the pre-migration SQLite file, which likely contains the
  Hevy key IN PLAINTEXT.** Gitignored, not deleted — the owner's data, their
  call. Flagged five times now.
- Hosting undecided (netcup leaning). No backup story yet; losing `sync_links`
  is the expensive failure, because re-sync would create DUPLICATE Hevy routines
  that cannot be deleted.
- `.claude/worktrees/e2e-build` is fully merged and redundant; safe to
  `git worktree remove`.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget as a Windows service; the `mariadb` CLI is not
on PATH (`C:\Program Files\MariaDB 12.3\bin\`), and Docker's CLI likewise needs
`$env:ProgramFiles\Docker\Docker\resources\bin` prepended until a new shell
picks it up. Tests run against either the native server or the container:
`npm run test:db:up` then `TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3307"
npm test`. That throwaway server on 3307 is also the way to run the app against
disposable data — point `DATABASE_URL` at it and the boot migration builds the
schema. Elevation: the session shell is not admin, but `Start-Process -Verb
RunAs` works and prompts UAC. Bitdefender's browser extension is installed and
injects attributes into the DOM — expect hydration warnings that are not the
app's fault ([[ui-design-system]]).

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
0. **Owner decides on the intake-parameter review** (see Active task) — and
   separately, fix the `classifyGoal` default-text bug, which is a bug on any
   reading. Whatever is adopted, [[trainee-profile]] needs updating in the same
   pass or it goes stale.
1. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the
   real database again.
2. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, generate one
   plan, confirm the preview reports an LLM plan and not a rules fallback.
3. **Sync one 2-day plan to Hevy.** First write to the live account;
   irreversible.
4. Decide what to do with the compose stack (`docker compose down [-v]`).
5. Deployment leftovers: a `mysqldump` backup cron, and pick the VPS.
6. Ask about deleting `data/`.
