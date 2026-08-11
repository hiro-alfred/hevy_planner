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
Nothing in flight. The last round did **next step 5: fed the workout records back
into plan generation** ([[suggested-loads]]).

`rules.ts` still emits `weightKg: null`, but the comment justifying it was half
false — the app has a full lifting history now. The owner was given three options
and chose **"suggest, don't commit"**:

- The plan page runs [[progressive-overload]]'s engine (the SAME call `/records`
  makes, asserted by a test) over the plan's exercises and shows the load each
  one's history implies. It becomes a plan weight only when **Use suggested
  loads** is pressed, because a plan weight syncs to a routine [[hevy-api]]
  cannot delete.
- **Suggestion runs AFTER generation, for BOTH generators.** The rules and LLM
  paths therefore cannot produce different loads for the same request, and the
  prompt stays cheap — it is never told about the history.
- **The rep-band trap** is the part worth remembering: the engine infers a band
  from the LOG while the plan prescribes one from the REQUEST. 140 kg earned in
  sets of five is a reckless start for sets of twelve, so mismatched suggestions
  are shown with the band they came from, dimmed, and excluded from the bulk
  apply. The per-exercise Edit form takes them one at a time.
- **N+1 avoided**: `getRecentSessions(ids)` in `last-session.ts` — one `inArray`
  plus `dense_rank()` inside SQL, capped at `PROGRESSION_WINDOW` imported from
  `progression.ts` — so a whole 7-day plan costs TWO queries, not fifty-six.

Two side effects worth knowing: `weightKg` is now editable per exercise (three
states — a number, an explicit null, an absent key that changes nothing), and the
plan page **displays loads at all** for the first time. It never did, even though
the LLM path could already set one from the stated working weights — an unshown
weight still synced.

New modules: `lib/planner/suggested-loads.ts` (pure policy), `lib/planner/plan-loads.ts`
(the two queries), `app/ui-loads.css`. New script: `scripts/seed-demo-history.mjs`.

Earlier rounds, unchanged: the routine browser and `/routines/[routineId]`;
[[exercise-records]], [[workout-history]] and [[progressive-overload]]; the
day-aware swap picker ([[exercise-alternatives]]); [[plan-editing]]; the Graphite
theme. Both previously carried-over decisions (the [[trainee-profile]] intake
review and the `classifyGoal` default-text bug) remain CLOSED.

## State reached
- **Suggested loads are built AND run.** Lint, `tsc`, **278 vitest tests** (up from
  254), the wiki tests and `next build` all green.
- **Verified in a real browser against a seeded MariaDB**, not just built: a 4-day
  upper/lower plan generated from the form with every recommendation branch visible
  at once (add weight 102.5, add reps 70, layoff deload 40, stall deload 90,
  baseline 30, the non-transferable strength squat 140, pull-ups with history but
  no load, and exercises with no history); "Use suggested loads (8)" pressed and the
  8 confirmed in the stored plan JSON with the squat correctly untouched; the new
  Edit weight field opened prefilled, typed to 97.5 and cleared back to null.
- **`scripts/cdp-drive.mjs` gained a `fill:` step.** React controlled inputs ignore
  a plain `.value` assignment — the native setter plus a bubbled `input` event is
  what React listens for. Forms behind a disclosure are now drivable, not only
  buttons.
- **`scripts/seed-demo-history.mjs` is new**: builds the demo catalog + history in
  one command, so verification does not start by re-inventing a seed each time. It
  DELETES the catalog and history first — throwaway databases only.
- **The database needs migrations `0001` and `0002` on next boot** against the
  owner's real database. Both are additive.
- Still nothing has met a **real Hevy account**: `/routines`, the workout
  endpoints, and the write path are all spec-shaped only.

## Open questions / dissents
- **BLOCKER: `.env` `DATABASE_URL` does not work.** A fresh `npm run dev` dies with
  `Access denied for user 'hevy'@'localhost' (using password: YES)`. Unchanged since
  2026-08-08. Everything screenshotted so far, this round included, ran against a
  **throwaway** database on 3307. Only the owner can fix the `hevy` password.
- **A `next dev` server is running on port 3000 and was NOT touched** (verified still
  serving 200 at wrap-up). Next 16 refuses a second dev server for the same
  directory, so this round used `next start -p 3005` and stopped it afterwards.
- **`scripts/seed-demo-history.mjs` was not asked for.** It is committed because
  every verified round so far has begun by hand-seeding a database and each one
  re-invented that seed. Delete it if that is unwanted.
- **Unproven: the rep-band equality rule against real training.** Bands compare by
  exact equality because both sides come from `BY_GOAL`; a trainee whose plan was
  hand-edited to a custom range gets no bulk apply at all. Conservative on purpose,
  but nobody has trained against it.
- **Unproven: `GET /v1/routines/{routineId}` and `GET /v1/routine_folders`**, and
  **every workout-endpoint response shape** — all from the pinned spec, which
  [[hevy-api]] has already caught lying about a field name once.
- **Unproven: LLM generation.** Still no `LLM_API_KEY` anywhere.
- **Unproven: the live Hevy write path**, and it is irreversible — no DELETE plus a
  routine cap. The first real sync must be a 2-day plan.
- **Unproven: the boot-migration retry** in `src/lib/db/migrate.ts`.
- **`data/` still holds the pre-migration SQLite file, which likely contains the Hevy
  key IN PLAINTEXT.** Gitignored, not deleted — the owner's data, their call.
  Flagged seven times now.
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

**The full run loop, start to screenshot** (proven twice now):

```
node -e "…create database hevy_loads…"                    # scratch db on 3307
DATABASE_URL=…/hevy_loads npx next start -p 3005          # boot builds the schema
SEED_DATABASE_URL=…/hevy_loads node scripts/seed-demo-history.mjs
chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<scratch> …
node scripts/cdp-drive.mjs <url> "Edit|fill:#weightKg-0-0=97.5|Save" <out.png> <sel>
```

Chrome is `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`; add
`--force-prefers-reduced-motion` or the capture freezes mid-reveal with every stat
counter reading 0. Screenshot paths must be **Windows** paths — a Git-Bash `/c/...`
path fails with "Access is denied". `CDP_SETTLE_MS` overrides the 4 s settle; a
server-action click needs 6–8 s or the shot catches a button still reading
"Building your plan…". Clicks match visible-text PREFIX and hit the FIRST match, so
targeting the third "Edit" on a page is still not possible.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Owner fixes `DATABASE_URL` in `.env`** so `npm run dev` boots against the real
   database again. Migrations `0001` and `0002` apply on that boot.
2. **Sync workout history against the real Hevy account** from `/records` — the first
   real exercise of the workout endpoints, and the only way to learn whether the spec
   is telling the truth about them. Read-only, so it is safe to try. It is also what
   makes [[suggested-loads]] say anything about real training rather than seed data.
3. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, generate one plan,
   confirm the preview reports an LLM plan and not a rules fallback.
4. **Sync one 2-day plan to Hevy.** First write to the live account; irreversible.
   Now also the first time a suggested LOAD would reach the account — apply the loads
   before syncing so that path is exercised deliberately rather than by accident.
5. **Use `scripts/cdp-drive.mjs` on what is still unclicked**: the rejected-exercises
   Restore/Clear list and the sync buttons. The swap picker, the Edit form and the
   suggested-loads button are now verified.
5a. **Open a real routine at `/routines/[id]`** once the key and database work — the
   only way to learn whether the single-routine and folder endpoints behave as the
   spec claims.
6. Decide what to do with the compose stack (`docker compose down [-v]`), pick the
   VPS, add a `mysqldump` backup cron, and ask about deleting `data/`.
