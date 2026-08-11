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
Nothing in flight. The last round built **records and progressive overload**, at the
owner's request, with the feature set designed by a Fable 5 subagent as asked:

- [[workout-history]] — a local mirror of LOGGED workouts (two new tables, migration
  `0002`, additive), synced by one backfill then the `/v1/workouts/events` delta feed.
- [[exercise-records]] — `/records` and `/records/[templateId]`: per-exercise PRs,
  a rep-max table, and recent sessions.
- [[progressive-overload]] — the next-session recommendation. **Deterministic
  double progression, NOT the LLM**, because progression is arithmetic and there is
  still no `LLM_API_KEY` to verify an LLM path against.

**Unlike every round before it, this one was actually run** against a database:
production build on a throwaway MariaDB with hand-seeded history, both pages
screenshotted, every recommendation branch (add weight / add reps / stall deload /
bodyweight / insufficient data) rendered, and an unknown exercise id 404ing.

**Both carried-over decisions are now CLOSED** — the owner delegated them
("do whatever you think is right for both") on 2026-08-11 and all of it shipped:

1. The intake-parameter review ([[trainee-profile]]) was **taken in full**. `age`
   is cut, `targetWeightKg` is replaced by an explicit `phase` enum, and a
   `goalKind` override was added. Both retired fields stay in
   `planRequestSchema` — the swap actions re-parse stored requests in place and
   zod strips what it does not know, so removing the keys would have deleted
   them from every existing plan on its next swap.
2. The `classifyGoal` default-text bug is **fixed twice over**: the classifier
   now counts keyword evidence instead of returning on the first pattern (and
   "build" is no longer a hypertrophy word), and `goalKind` skips it entirely
   when set. The form defaults the new select to "Read it from what I wrote".

Also this round: the **swap picker now ranks against the DAY**
([[exercise-alternatives]]), so a replacement can neither strip a muscle of the
work the day was giving it nor pile onto one the day already hammers; and
`validatePlan` gained the generation-time half of the same rule.

**What was actually run**: all of it, in a real browser, against the throwaway DB
and the real 452-template catalog. The rebuilt plan form (age and target weight
gone, phase and rep-range selects in place); the lopsided-day rule BOTH
directions; and — via the new CDP driver below — **the swap picker itself,
opened and paged**, which nothing in this project had ever done.

## State reached
- **Records, the history cache and the progression engine are built and run.**
  Lint, `tsc`, **195 vitest tests** (up from 144), 14 wiki tests and `next build`
  green. `/records` is in the nav between "In Hevy" and "Settings".
- **The database needs migration `0002` on next boot** (tables `workouts`,
  `workout_sets`). Purely additive — two new tables, nothing existing touched — and
  it has been applied to a real MariaDB on boot, though only a throwaway one.
  Migration `0001` (`plans.derived_from_plan_id`) may also still be pending on the
  owner's real database.
- Earlier and unchanged: **swap, editing, forking and the Hevy read-back are all
  built** ([[exercise-alternatives]], [[plan-editing]], [[plan-generation]]). Of
  those, still nothing is human-verified: `/routines` has never run against a real
  account, and the plan-prompt latency claim rests on measured token counts rather
  than a timed generation.
- **The dev server is reachable from the LAN** — `next.config.ts` carries
  `allowedDevOrigins: ["192.168.0.*"]`.
- **Graphite is live across all screens** and screenshotted running.
- **The container path is proven** ([[deployment]]).

## Open questions / dissents
- **BLOCKER: `.env` `DATABASE_URL` does not work.** A fresh `npm run dev` dies with
  `Access denied for user 'hevy'@'localhost' (using password: YES)`. Unchanged since
  2026-08-08. Everything screenshotted so far, including this round, ran against a
  **throwaway** database on 3307, never the owner's real one. Only the owner can fix
  the `hevy` password in `.env`.
- **A `next dev` server is running on port 3000 and was NOT touched.** Next 16
  refuses a second dev server for the same directory, so this round used
  `next start` on 3005/3006 instead of killing it. It is presumably the owner's.
- **Unproven: every workout-endpoint response shape.** `HevyWorkout`,
  `HevyWorkoutEvent` and the `events?since=` semantics (inclusive? compared against
  `updated_at`?) all come from the pinned spec, which [[hevy-api]] has already caught
  lying about a field name once. Delta application is idempotent so an overlap is
  harmless, but nothing here has met a real account.
- **Unproven: LLM generation.** Still no `LLM_API_KEY` anywhere. `@ai-sdk/deepseek`
  does not set `supportsStructuredOutputs`, so `generateObject` runs in `json_object`
  mode, which DeepSeek documents as occasionally returning empty content.
- **Unproven: the live Hevy write path**, and it is irreversible — no DELETE
  endpoint plus a routine cap ([[hevy-api]]). The first real sync must be a 2-day plan.
- **Unproven: the boot-migration retry** in `src/lib/db/migrate.ts`.
- **`data/` still holds the pre-migration SQLite file, which likely contains the Hevy
  key IN PLAINTEXT.** Gitignored, not deleted — the owner's data, their call. Flagged
  six times now.
- **[[log]] is at 290 of its 300 lines** — the next entry must rotate the oldest into
  [[log-archive]] first.
- Hosting undecided (netcup leaning). No backup story yet; losing `sync_links` is the
  expensive failure, because re-sync would create DUPLICATE Hevy routines.
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
schema. Because `next dev` refuses to start beside the running one on 3000, use
`npm run build` then `DATABASE_URL=… npx next start -p 3005`. Elevation: the
session shell is not admin, but `Start-Process -Verb RunAs` works and prompts UAC.
Bitdefender's browser extension injects attributes into the DOM — expect hydration
warnings that are not the app's fault ([[ui-design-system]]).

**Screenshots**: no Playwright here, and Claude for Chrome is a browser-side
product this session cannot reach. For a static page the tool is
`chrome --headless --disable-gpu --screenshot=… --window-size=W,H` from
`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`, plus
`--force-prefers-reduced-motion` — without it the capture freezes mid-reveal with
every stat counter still reading 0. The `--screenshot=` path must be a **Windows**
path; a Git-Bash `/c/...` path fails with "Access is denied".

**Clicking is solved** (2026-08-11). `scripts/cdp-drive.mjs` drives the same
installed Chrome over the DevTools Protocol with **no new dependency** — Node
22.18 ships a global `WebSocket`, so a ~60-line script is a complete driver.
Launch Chrome with `--remote-debugging-port=9222 --user-data-dir=<scratch>`, then
`node scripts/cdp-drive.mjs <url> "Swap|More alternatives" <out.png> [selector]`.
Clicks match visible-text PREFIX, and the selector dump makes a run readable in
the terminal rather than only in the PNG. **The long-standing "nothing here is
human-verified" gap is now a choice, not a limitation** — anything behind a click
can be exercised.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the real
   database again. Migrations `0001` and `0002` apply on that boot.
2. **Sync workout history against the real Hevy account** from `/records` — the first
   real exercise of the workout endpoints, and the only way to learn whether the spec
   is telling the truth about them. Read-only, so it is safe to try.
3. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, generate one plan,
   confirm the preview reports an LLM plan and not a rules fallback.
4. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
5. Consider feeding records back into generation — `rules.ts` still leaves starting
   loads blank on the now-obsolete grounds that "the app has no lifting history yet".
5a. **Use `scripts/cdp-drive.mjs` on the rest of the interactive UI.** The swap
   picker is now verified; the per-exercise Edit form, the rejected-exercises
   Restore/Clear list and the sync buttons have still never been clicked.
6. Decide what to do with the compose stack (`docker compose down [-v]`), pick the
   VPS, add a `mysqldump` backup cron, and ask about deleting `data/`.
