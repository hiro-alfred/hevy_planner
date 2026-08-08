---
title: Testing setup — vitest for app code, pytest for the wiki
aliases: [tests, testing, vitest, test setup, test database]
tags: [subsystem, tooling, tests, mariadb]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [vitest.config.mts, docker-compose.test.yml, package.json, src/test/database.ts, src/test/global-setup.ts, tests/test_knowledge_wiki.py]
---

# Testing setup

Two independent suites, deliberately kept apart:

| Suite | Runner | Command | Scope |
| ----- | ------ | ------- | ----- |
| App logic | vitest | `npm run test:db:up` once, then `npm test` | `src/**/*.test.ts` |
| Vault lint | pytest | `python -m pytest tests/test_knowledge_wiki.py` | `knowledge/` graph ([[wiki-enforcement]]) |

`vitest.config.mts` maps the `@/` alias to `src/` and runs in the plain `node`
environment — the suites cover `lib/` logic, not React rendering. The `.mts`
extension is required: as `.ts` under a CommonJS `package.json`, Vite's native
config loader warns on every run.

## The suite now needs a database server

This is the real cost of [[mariadb-migration]]. The old setup pointed
`DATABASE_PATH` at a temp file and needed no infrastructure at all; a database
server cannot be conjured per test, so `docker-compose.test.yml` provides one:

- port **3307**, not 3306, so an existing local MySQL/MariaDB keeps working
- `tmpfs` for `/var/lib/mysql` — nothing survives the run, and the per-file
  `CREATE DATABASE` + migration churn is much faster in RAM
- `--max-connections=200`, because vitest runs files in parallel and each file's
  pool is 10

`npm run test:db:up` starts it and waits for health; `npm run test:db:down`
removes it. `TEST_DATABASE_URL` points the suite at your own server instead —
it will `CREATE` and `DROP` databases there, so never aim it at real data.

> [!tip] Docker is not actually required
> The dev machine has no Docker daemon, so the suite is run against the natively
> installed MariaDB instead, and passes 63/63:
> `TEST_DATABASE_URL="mysql://root:<pw>@127.0.0.1:3306" npm test`.
> The throwaway-database-per-file design means a shared server is safe — the
> suite only ever touches databases it created. That is the route to use here
> until Docker exists on this box ([[mariadb-migration]]).

## Testing DB-backed modules

`src/lib/db/client.ts` resolves `DATABASE_URL` **at import time** into a module
singleton. That constraint is unchanged from the SQLite era: tests must claim a
database *before* importing anything that pulls the client in, so the modules
under test are loaded with `await import()` inside `beforeAll`, never as
top-level imports.

```ts
const database = createTempDatabase("hevy_catalog");  // top level: sets DATABASE_URL
beforeAll(async () => {
  await database.migrate();          // CREATE DATABASE, then real migrations
  catalog = await import("./catalog");
});
afterAll(() => database.cleanup());  // end pool, then DROP DATABASE
```

A database per **file**, not per test — vitest runs files in parallel workers,
so a shared one would let an unrelated file's `DELETE` land mid-assertion. The
name carries a random suffix so a crashed run cannot poison the next one.

> [!warning] `cleanup()` must end the pool before dropping
> Open connections both block the `DROP` and keep the worker's event loop alive
> until the run times out. `db.$client.end()` comes first, always.

This runs the real migrations against real MariaDB, so the tests exercise actual
dialect SQL — which is how the `ORDER BY` trap in [[catalog-service]] surfaced,
and it is the only thing that will catch a MariaDB-only fault such as the JSON
column mapping described in [[mariadb-migration]].

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

> [!note] The Windows build trap is gone
> The old warning here was that `npm install` tried to compile `better-sqlite3`
> from source and failed at `node-gyp` (VS2019 present, no Windows SDK), so
> `--ignore-scripts` was mandatory on this machine. `mysql2` is pure JavaScript,
> so a plain `npm install` now works. The Dockerfile keeps `--ignore-scripts`
> anyway, to keep install hooks out of the image build.
