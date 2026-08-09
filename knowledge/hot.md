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
The **UI was rebuilt again**, from the neon-HUD into the **Graphite theme**
([[ui-design-system]]): the owner judged the HUD's UX still bad, picked from
five screenshotted mockups, and chose the refined-dark one. Committed on `dev`.
The three unproven paths are unchanged — LLM generation and the first live Hevy
write both still need the owner, and the boot-migration retry still has not fired.

## State reached
- **Graphite is live across all four screens** and was screenshotted running,
  not just built: dashboard (all four sync states), `/plans/[id]`, `/plans/new`,
  `/settings`. Lint, `tsc`, 103 vitest tests, 14 wiki tests and `next build` all
  green.
- `hud.css` / `hud-controls.css` → `ui.css` / `ui-controls.css`, and every
  `hud-*` class and token renamed to `ui-*`. `hud-backdrop.tsx` and
  `pointer-glow.tsx` are **deleted**, which removes the only runtime inline
  style in the app.
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
- **The compose stack is still UP** on port 3000 against a fresh empty volume —
  it is not the owner's working instance (no Hevy key, no catalog).
  `docker compose down` stops it; add `-v` to also drop `hevy_planner_db-data`.
  `npm run dev` defaults to 3000 and will collide while it runs.
- **`data/` still holds the pre-migration SQLite file, which likely contains the
  Hevy key IN PLAINTEXT.** Gitignored, not deleted — the owner's data, their
  call. Flagged four times now.
- [[log]] is at 295 of its 300-line cap — the next entry needs
  [[log-archive]] to take the oldest ones first.
- Hosting undecided (netcup leaning). No backup story yet; losing `sync_links`
  is the expensive failure, because re-sync would create DUPLICATE Hevy routines
  that cannot be deleted.
- `.claude/worktrees/e2e-build` is fully merged and redundant; safe to
  `git worktree remove`.
- **The first `obsidian` command of a session can hang for the whole session,
  and that is not a syntax error.** With no CLI-listening Obsidian instance
  present, the first invocation *becomes the host process*: it loads
  `obsidian.asar` and blocks forever, and every later `obsidian` command is
  served BY it (they appear in its log as `Received command line [...]`). So
  call one hangs and calls two onward work. Backgrounding the first call and
  carrying on is the right move. Whether the skill's `vault=…`/`file=…` form is
  also wrong is UNTESTED — only CLAUDE.md's `path=` form has actually been run
  here.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget as a Windows service; the `mariadb` CLI is not
on PATH (`C:\Program Files\MariaDB 12.3\bin\`), and Docker's CLI likewise needs
`$env:ProgramFiles\Docker\Docker\resources\bin` prepended until a new shell
picks it up. Tests run against either the native server or the container:
`npm run test:db:up` then `TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3307"
npm test`. That throwaway server on 3307 is also the way to run the app against
disposable data — point `DATABASE_URL` at it and the boot migration builds the
schema. Elevation: the session shell is not admin, but `Start-Process -Verb
RunAs` works and prompts UAC.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the
   real database again.
2. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, generate one
   plan, confirm the preview reports an LLM plan and not a rules fallback.
3. **Sync one 2-day plan to Hevy.** First write to the live account;
   irreversible.
4. Decide what to do with the running stack (`docker compose down [-v]`).
5. Deployment leftovers: a `mysqldump` backup cron, and pick the VPS.
6. Ask about deleting `data/`.
