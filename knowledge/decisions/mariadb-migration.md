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

> [!note] Drizzle's `json()` and MariaDB — the risk is real but version-dependent
> The built-in mysql `json()` column defines `mapToDriverValue` but **no**
> `mapFromDriverValue` — on read it trusts the driver. That is safe on MySQL 8,
> where `JSON` is protocol type 245 and mysql2 auto-parses it. MariaDB's `JSON`
> is only an alias for `LONGTEXT` with a `JSON_VALID()` check, so the worry was
> that the driver hands back a raw string and drizzle passes it through —
> failing silently at the first property access rather than at the query.
>
> **Measured on MariaDB 12.3.2 + mysql2 3.23.2:** the column *is* reported as
> protocol type 252 (LONGTEXT), not 245 — but mysql2 parses it anyway, using the
> extended metadata MariaDB 10.5+ sends marking the column format as JSON. Both
> the text and binary protocols returned an object. So `json()` would have
> worked on this stack; the original claim that it could not was wrong.
>
> `src/lib/db/json-column.ts` is kept regardless, because it does not depend on
> that path — an older MariaDB, or a driver ignoring extended metadata, returns
> the string. Its `typeof` branch makes it a no-op when the driver has already
> parsed, so it costs nothing and drops a version-dependent assumption.

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

**Verified end to end on 2026-08-08** against MariaDB 12.3.2 installed natively
on the dev machine (`winget install MariaDB.Server`; no Docker, no
virtualization — the firmware supports it but WSL2 has no distro):

- **63/63 tests pass** against a real server, with `TEST_DATABASE_URL` pointing
  at it. Each file created, migrated, and dropped its own database.
- The boot migration ran on first request and produced all four tables plus
  `__drizzle_migrations`.
- Every route answers: `/`, `/settings`, `/plans/new` → 200, and a missing plan
  id → 404. No errors in the dev server log.
- `npm run build` (incl. TypeScript), `npm run lint`, `drizzle-kit generate` all
  green.

> [!warning] Still unverified: the container path
> `docker compose up` and the Dockerfile have never been run, so the compose
> wiring, the `depends_on` healthcheck, and the boot-migration retry are
> reasoned-about, not observed ([[deployment]]). Local dev talks to a native
> MariaDB on 3306 instead. Note also that local is 12.3 (rolling) while the
> compose files pin 11.4 (LTS) — immaterial for the SQL used here, but it means
> "works locally" is not yet "works in the image".
