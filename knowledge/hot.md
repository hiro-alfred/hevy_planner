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
Making the **container path runnable on this machine** ([[deployment]]) — the
last of the three unproven paths that is blocked by tooling rather than by a
missing key. The repo side is done; the host side is half done and **waiting on
a reboot**.

## State reached
- **WSL2 prerequisites enabled.** `Microsoft-Windows-Subsystem-Linux` and
  `VirtualMachinePlatform` both report `Enabled` after
  `dism /online /enable-feature /all /norestart` (run elevated, exit 3010 =
  reboot required). Before this the box had VT-x and SLAT in firmware but no
  hypervisor at all. Nothing else is installed yet: no WSL distro, no kernel
  update, no Docker Desktop.
- **`docker-compose.yml` fixed on two counts**, both of which would have bitten
  on the first `compose up`:
  - the `app` service passed `ANTHROPIC_API_KEY`, a name nothing has read since
    the provider became configurable. It now passes the `LLM_*` family that
    `src/lib/planner/provider.ts` actually reads. Because a missing key falls
    back to the rule-based generator instead of erroring, this would have looked
    like a working container writing worse plans.
  - the host port is now `${APP_PORT:-3000}`, documented in `.env.example`. A
    node process holds 3000 on this machine (the dev server is on 3001), so the
    hard-coded mapping would have failed the bind.
- Both compose files still parse. The app itself is unchanged — `dev` @
  `bd6769b` plus these two files.

## Open questions / dissents
- **Unproven: the container path**, still. Enabling the features proves nothing
  about the compose wiring, the `depends_on` healthcheck or the boot-migration
  retry; the first `compose up` remains unobserved ground, and local MariaDB is
  12.3 against the 11.4 pinned in the compose files.
- **Unproven: LLM generation.** No `LLM_API_KEY` anywhere yet. Note that
  `@ai-sdk/deepseek` does not set `supportsStructuredOutputs`, so
  `generateObject` runs in `json_object` mode, which DeepSeek documents as
  occasionally returning empty content — check `source` before judging a plan.
- **Unproven: the live Hevy write path.** Sync has only ever run against a stub,
  and it is irreversible — no DELETE endpoint, plus a routine cap
  ([[hevy-api]]). The first real sync must be a 2-day plan.
- **Uncommitted UI work is sitting in the tree and is NOT mine.** `hud.css`,
  `animations.css`, `hud-backdrop.tsx`, `pointer-glow.tsx`,
  `reveal-observer.tsx` (~890 new lines) plus a modified `globals.css` appeared
  during the session; the tree was clean at its start. Left untouched and
  uncommitted deliberately. Two things to raise with the owner: whose it is, and
  that `hud.css` at 461 lines breaks the 300-line rule in CLAUDE.md.
- **`data/` still holds the pre-migration SQLite file, which likely contains the
  Hevy key IN PLAINTEXT.** Gitignored, not deleted — the owner's data, their
  call. Flagged three times now.
- Hosting undecided (netcup leaning). No backup story yet; losing `sync_links`
  is the expensive failure, because re-sync would create DUPLICATE Hevy routines
  that cannot be deleted.
- `.claude/worktrees/e2e-build` is fully merged and redundant; safe to
  `git worktree remove`.

## Local dev setup (this machine)
MariaDB 12.3.2 native via winget, running as a Windows service; root and app
user `hevy` both use the throwaway password `hevydev`. The `mariadb` CLI is not
on PATH (`C:\Program Files\MariaDB 12.3\bin\`). `npm run dev` serves **port
3001**. Tests need the server:
`TEST_DATABASE_URL="mysql://root:hevydev@127.0.0.1:3306" npm test`.
Elevation: this session's shell is not admin — `Start-Process -Verb RunAs`
works and prompts UAC, which is how the dism run above was done.

> [!warning] `.env` must never be read (CLAUDE.md)
> Append new keys rather than rewriting the file, and only with names that
> cannot already exist in it.

## Next steps
1. **Reboot**, then finish the daemon: `wsl --update`,
   `wsl --set-default-version 2`, `wsl --install -d Ubuntu`,
   `winget install -e --id Docker.DockerDesktop` (all elevated), then one manual
   Docker Desktop launch for the terms and the WSL2-engine checkbox.
2. Prove it cheaply first: `docker run --rm hello-world`, then
   `docker compose -f docker-compose.test.yml up -d` with the suite pointed at
   3307 ([[testing-setup]]), and only then `docker compose up --build`. Set
   `APP_PORT` if the dev server still holds 3000.
3. **Owner adds `LLM_API_KEY=<deepseek key>` to `.env`**, restart, generate one
   plan, confirm the preview reports an LLM plan and not a rules fallback.
4. **Sync one 2-day plan to Hevy.** First write to the live account;
   irreversible.
5. Ask about the stray UI files and about deleting `data/`.
