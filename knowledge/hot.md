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
UI revamped from the Tailwind starter defaults to a **neon-HUD theme**
([[ui-design-system]]) — dark-only, animated canvas backdrop, scroll reveal,
pointer-tracked panel glow, count-up stat tiles. All checks green: lint,
`tsc --noEmit`, 90 vitest tests, `npm run build`. Dashboard, settings and the
plan form were verified in a real browser; `/plans/[id]` was not (no plans in
the DB).

**The app cannot boot on the committed `.env`** — see the blocker below. That is
the first thing to fix next session.

## State reached
- **Neon-HUD UI shipped.** New CSS layer (`globals.css` → `hud.css` +
  `hud-controls.css` + `animations.css`) and six components: `hud-backdrop`,
  `pointer-glow`, `reveal-observer`, `count-up`, `status-chip`, `stat-tile`.
  Every page and shared component restyled. Two bugs found by LOOKING at
  screenshots rather than trusting green checks: the button hover-sweep sat
  permanently visible (a `::before` with no `left`), and `ActionButton`
  stretched full-width in column layouts. Both fixed; both recorded in
  [[ui-design-system]].
- Unchanged from before: MariaDB ([[mariadb-migration]]), 452 cached templates
  ([[catalog-service]]), the encrypted Hevy key ([[key-handling]], still
  configured, `····0C88`), DeepSeek wired but unexercised ([[plan-generation]]).

## Open questions / dissents
- **BLOCKER — `.env` `DATABASE_URL` is wrong.** A fresh boot dies in
  `instrumentation.ts` with `Access denied for user 'hevy'@'localhost'`. The
  database is fine: `hevy`/`hevydev` connects from the MariaDB CLI and
  `hevy_planner` still holds 452 templates and the encrypted key. So it is the
  credential string in `.env` — most likely from the blind appends this file
  warns about below. The previous server never showed it because it connected
  at boot and Next reloads `.env` WITHOUT re-running instrumentation, so the
  breakage sat latent. It was worked around this session by overriding
  `DATABASE_URL` in the process environment (Next does not override vars
  already set there) — that override dies with the terminal.
- **Unproven: `/plans/[id]` has never rendered.** Zero plans in the database.
  Generating one plan exercises the LLM path AND this page at once.
- **Unproven: LLM generation.** No `LLM_API_KEY`. Note `@ai-sdk/deepseek` does
  not set `supportsStructuredOutputs`, so `generateObject` runs in
  `json_object` mode, which can return empty content — check `source` before
  judging a plan.
- **Unproven: the live Hevy write path.** Sync has only run against a stub, and
  it is irreversible (no DELETE, routine cap — [[hevy-api]]). First real sync
  must be a 2-day plan.
- **Unproven: the container path.** No Docker daemon on this machine
  ([[deployment]]).
- **`data/` still holds the pre-migration SQLite file, likely containing the
  Hevy key IN PLAINTEXT.** Gitignored, not deleted — the owner's call. Flagged
  three times now.
- Hosting undecided (netcup leaning). No backup story; losing `sync_links` is
  the expensive failure ([[hevy-sync]]).
- `.claude/worktrees/e2e-build` is fully merged and redundant; safe to
  `git worktree remove`.

## Local dev setup (this machine)
MariaDB 12.3.2 installed natively via `winget install MariaDB.Server`, running as
a Windows service; root and app user `hevy` both use the throwaway password
`hevydev`. The `mariadb` CLI is NOT on PATH (it lives in
`C:\Program Files\MariaDB 12.3\bin\`).
**`npm run dev` now serves port 3000** — the stale `next start` that had been
holding 3000 was killed this session, so dev no longer falls through to 3001.
Tests need the server: `TEST_DATABASE_URL="mysql://root:hevydev@127.0.0.1:3306" npm test`.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it. The blocker above is what blind appends cost.

## Next steps
1. **Fix `DATABASE_URL` in `.env`** so `npm run dev` boots unaided — a known-good
   value is `mysql://hevy:hevydev@127.0.0.1:3306/hevy_planner`. Confirm by
   starting dev with no environment override and loading `/`.
2. **Add `LLM_API_KEY=<deepseek key>`**, restart, generate one plan. This closes
   two gaps at once: the LLM path, and the first-ever render of `/plans/[id]`.
   Check the preview reports an LLM plan rather than a rules fallback, and look
   at the HUD styling on that page.
3. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
4. Offer to delete `data/` (plaintext key leftover) — ask, do not assume.
5. Deploy: prove `docker compose up`, add a `mysqldump` backup cron, pick the VPS.
