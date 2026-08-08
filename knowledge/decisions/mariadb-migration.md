---
title: MariaDB migration — moving off SQLite
aliases: [mariadb, mysql, database migration, sqlite to mariadb, dialect]
tags: [decision, database, mariadb, drizzle]
type: design
created: 2026-08-08
updated: 2026-08-08
sources: [src/lib/db/schema.ts, src/lib/db/client.ts, src/lib/db/json-column.ts, src/lib/db/migrate.ts, drizzle.config.ts, docker-compose.yml, docker-compose.test.yml]
---

# MariaDB migration

**2026-08-08, owner's call.** All phase-1 state moved from SQLite
(`better-sqlite3`) to MariaDB (Drizzle's `mysql` dialect over `mysql2`),
superseding the storage decision in [[product-architecture]].

Done greenfield: no instance held real data, so the two SQLite migrations were
squashed into a single fresh `0000` for the new dialect rather than being
translated. There is no SQLite→MariaDB data path, and none was needed.

## What it cost

Recorded plainly because the [[product-architecture]] rationale for SQLite was
"near-zero ops", and that is exactly what was traded away:

- **Deployment is two containers, not one.** The app can no longer create its
  own store; `docker-compose.yml` is now the supported entry point, and boot has
  a start-order race to survive ([[deployment]]).
- **The test suite needs a running server.** It used to need nothing at all
  ([[testing-setup]]).
- **A second app instance became conceivable**, which the in-memory sync lock
  does not cover — see the warning in [[hevy-sync]].

What it bought is real but not yet used: an external, independently backed-up
store that more than one process could share, and a shorter path to phase-2
multi-user than a SQLite→Postgres swap would have been.

## Dialect traps

> [!warning] Drizzle's `json()` does not round-trip on MariaDB
> The built-in mysql `json()` column defines `mapToDriverValue` but **no**
> `mapFromDriverValue` — on read it trusts the driver. That works on MySQL 8,
> where `JSON` is protocol type 245 and mysql2 auto-parses it. MariaDB's `JSON`
> is only an alias for `LONGTEXT` with a `JSON_VALID()` check, so the protocol
> reports text, mysql2 returns the raw string, and drizzle passes it straight
> through. The failure is silent and late: `plans.request` comes back a string
> and the first property access throws. `src/lib/db/json-column.ts` maps both
> directions instead; do not replace it with `json()`.

Everything else that had to change, and why:

| SQLite | MariaDB | Note |
| --- | --- | --- |
| `text` primary key | `varchar(n)` | TEXT cannot be a PK without a prefix length |
| `.returning({ id })` | `result.insertId` | no `RETURNING` clause exists |
| `.onConflictDoUpdate({ target })` | `.onDuplicateKeyUpdate({ set })` | fires on any unique key; no target named |
| `db.transaction(tx => …)` sync | `await db.transaction(async tx => …)` | `better-sqlite3` was synchronous, `mysql2` is not |
| `json_each()` in `EXISTS` | OR-chain of `JSON_CONTAINS(…, JSON_QUOTE(?))` | MariaDB has neither `json_each` nor `JSON_OVERLAPS` ([[catalog-service]]) |
| `escape '\'` | `escape '!'` | backslash is unwritable across `sql_mode`s ([[catalog-service]]) |
| `integer` boolean/timestamp | `boolean`, ISO-8601 `varchar(32)` | timestamps stay strings; the app sorts them as strings |

## Verification status

> [!warning] The DB-backed suites have not been run
> There is no Docker daemon and no MariaDB on the development machine, so
> `npm test` could not execute against a real server. What *was* verified:
> `npm run build` (including TypeScript), `npm run lint`, `drizzle-kit generate`,
> and a scratch check compiling every translated query through drizzle's mysql
> dialect — confirming `json_contains`/`json_quote` with bound parameters, no
> `json_each`, a parseable `escape '!'`, `on duplicate key update`, and the JSON
> column mapping in both directions. The 63 tests were green on SQLite
> immediately before the change. First run on a machine with Docker is the
> outstanding step.
