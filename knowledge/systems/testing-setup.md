---
title: Testing setup — vitest for app code, pytest for the wiki
aliases: [tests, testing, vitest, test setup]
tags: [subsystem, tooling, tests]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [vitest.config.mts, package.json, src/lib/hevy/catalog.test.ts, tests/test_knowledge_wiki.py]
---

# Testing setup

Two independent suites, deliberately kept apart:

| Suite | Runner | Command | Scope |
| ----- | ------ | ------- | ----- |
| App logic | vitest | `npm test` | `src/**/*.test.ts` |
| Vault lint | pytest | `python -m pytest tests/test_knowledge_wiki.py` | `knowledge/` graph ([[wiki-enforcement]]) |

`vitest.config.mts` maps the `@/` alias to `src/` and runs in the plain `node`
environment — the suites cover `lib/` logic, not React rendering. The `.mts`
extension is required: as `.ts` under a CommonJS `package.json`, Vite's native
config loader warns on every run.

## Testing DB-backed modules

`src/lib/db/client.ts` resolves `DATABASE_PATH` **at import time** into a module
singleton. Tests therefore must point it at a temp file *before* importing
anything that pulls the client in — so the modules under test are loaded with
`await import()` inside `beforeAll`, never as top-level imports:

```ts
process.env.DATABASE_PATH = join(mkdtempSync(...), "test.sqlite");
const { runMigrations } = await import("@/lib/db/migrate");
runMigrations();                       // real schema, from drizzle/
const catalog = await import("./catalog");
```

This runs the real migrations against a real SQLite file, so the tests exercise
actual SQL (which is how the ORDER BY trap in [[catalog-service]] surfaced).
Network boundaries are stubbed instead — a fake `HevyClient` serving fixed pages.

## What `npm run build` does NOT catch

A green build is not a working page. Two classes of failure have already slipped
through it, so every page gets loaded from a running server before a milestone
is called done:

- **Calling a function exported from a `"use client"` module in a server
  component.** It type-checks and builds, then throws at request time:
  *"Attempted to call buttonClasses() from the server but buttonClasses is on
  the client."* A client module's exports can be rendered as components or
  passed as props, not called. Shared helpers therefore live in a plain module
  (`src/components/button-styles.ts`), not beside the client component that
  happens to use them.
- **Anything behind a server action or a live DB read**, since the build only
  renders what it can prerender.

The verification that catches these is a `curl` per route against `next start`,
including one deliberately-missing id to confirm the 404 path.

> [!warning] Installing on Windows without a Windows SDK
> `npm install` tries to compile better-sqlite3 from source and fails at
> `node-gyp` (VS2019 present, no Windows SDK). The package **ships prebuilt
> binaries** for win32-x64, so `npm install --ignore-scripts` installs a working
> module and skips the pointless build. Use that flag on this machine.
