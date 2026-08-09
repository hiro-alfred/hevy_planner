---
title: Hot — session working memory
aliases: [hot, working memory, where we left off]
tags: [meta, session]
type: meta
created: 2026-08-08
updated: 2026-08-09
sources: []
---

# Hot — where we left off

Working memory for **session continuity** ([[schema]]): every new session reads this
page FIRST and resumes from **Next steps**; every wrap-up OVERWRITES it with the
latest state. History belongs in [[log]] — this page holds only the CURRENT state.
Keep the four sections below; they are the template.

## Active task
The **container path is proven** ([[deployment]]) — Docker is installed on the
Windows box and `docker compose up` runs the real two-container stack. That
clears one of the three unproven paths. Two remain, and both need the owner:
the LLM key and the first live Hevy write.

## State reached
- **Docker Desktop 4.85.0** (engine 29.6.2, compose v5.3.1) installed via
  winget, on WSL 2.7.11 / kernel 6.18. The dism feature enable needed a reboot
  (exit 3010) before any of it worked. No user distro was installed — the
  `wsl --install -d Ubuntu` step was interrupted and turned out to be
  unnecessary, since Docker Desktop ships its own `docker-desktop` WSL image.
- **`docker compose up -d --wait`: both services healthy.** The db goes healthy
  first and the app starts after it, so `depends_on: service_healthy` behaves.
  The boot migration built the full schema on an empty volume
  (`__drizzle_migrations`, `exercise_templates`, `plans`, `settings`,
  `sync_links`) — silently, so tables are the evidence, not log output. `/`,
  `/plans/new` and `/settings` all answer 200 on the published port.
- **The image could never have been built before today.** `COPY /app/public`
  failed: there is no `public/` — the favicon is App Router metadata in
  `src/app/`. Fixed with a `.gitkeep`, since COPY errors on a missing source
  instead of skipping it. This was the one thing all the prior reasoning missed.
- **103/103 tests green against the pinned MariaDB 11.4** via the throwaway test
  stack on 3307, so the "local runs 12.3, compose pins 11.4" worry is closed.
- Earlier in the session: `docker-compose.yml` fixed to pass the `LLM_*` family
  instead of the dead `ANTHROPIC_API_KEY`, and to publish `${APP_PORT:-3000}`.

## Open questions / dissents
- **The stack is still UP** on port 3000, against a fresh empty volume — it is
  not the owner's working instance (no Hevy key, no catalog). `docker compose
  down` stops it; add `-v` to also drop `hevy_planner_db-data`. Note that
  `npm run dev` defaults to 3000 and will collide while it runs.
- **Unproven: the boot-migration retry.** The app has never started against a
  database that was not already accepting connections, so the 60s
  connection-phase retry in `src/lib/db/migrate.ts` has not fired. An
  orchestrated `compose up` is precisely the case `depends_on` already covers.
- **Unproven: LLM generation.** No `LLM_API_KEY` anywhere yet. Note that
  `@ai-sdk/deepseek` does not set `supportsStructuredOutputs`, so
  `generateObject` runs in `json_object` mode, which DeepSeek documents as
  occasionally returning empty content — check `source` before judging a plan.
- **Unproven: the live Hevy write path.** Sync has only ever run against a stub,
  and it is irreversible — no DELETE endpoint, plus a routine cap
  ([[hevy-api]]). The first real sync must be a 2-day plan.
- **Uncommitted UI work in the tree is the owner's, in progress — leave it
  alone.** A HUD/animation layer (`hud.css`, `animations.css`,
  `hud-backdrop.tsx`, `pointer-glow.tsx`, `reveal-observer.tsx`, `count-up.tsx`,
  `stat-tile.tsx`, `status-chip.tsx` plus edits across the pages and
  `globals.css`). Do not commit, revert or refactor it, and do not re-flag it.
  One thing to mention only if it comes up: `hud.css` is 461 lines, over the
  300-line rule in CLAUDE.md.
- **`data/` still holds the pre-migration SQLite file, which likely contains the
  Hevy key IN PLAINTEXT.** Gitignored, not deleted — the owner's data, their
  call. Flagged three times now.
- Hosting undecided (netcup leaning). No backup story yet; losing `sync_links`
  is the expensive failure, because re-sync would create DUPLICATE Hevy routines
  that cannot be deleted.
- `.claude/worktrees/e2e-build` is fully merged and redundant; safe to
  `git worktree remove`.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget as a Windows service; root and app user `hevy`
both use the throwaway password `hevydev`. The `mariadb` CLI is not on PATH
(`C:\Program Files\MariaDB 12.3\bin\`). Docker's CLI is likewise not on this
session's PATH until a new shell picks it up — prepend
`$env:ProgramFiles\Docker\Docker\resources\bin`. Tests can run against either
the native server or the container:
`TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3307" npm test` after
`npm run test:db:up`. Elevation: the session shell is not admin, but
`Start-Process -Verb RunAs` works and prompts UAC.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, generate one
   plan, confirm the preview reports an LLM plan and not a rules fallback. Under
   compose the key now actually reaches the container.
2. **Sync one 2-day plan to Hevy.** First write to the live account;
   irreversible.
3. Decide what to do with the running stack (`docker compose down [-v]`).
4. Deployment leftovers: a `mysqldump` backup cron, and pick the VPS.
5. Ask about deleting `data/`.
