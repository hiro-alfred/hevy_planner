---
title: Deployment — standalone build, Docker image, and the MariaDB service
aliases: [deploy, docker, dockerfile, standalone, hosting, compose, docker-compose]
tags: [subsystem, deployment, docker, ops, mariadb]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [Dockerfile, docker-compose.yml, .dockerignore, next.config.ts, src/instrumentation.ts, src/lib/db/migrate.ts]
---

# Deployment

Self-hosted, persistent server — not serverless. That was decided in
[[product-architecture]] and it still holds after the move to MariaDB
([[mariadb-migration]]): the app is a long-running process that keeps a
connection pool, and the database is a stateful service beside it.

The unit of deployment is now **two containers, not one**. `docker-compose.yml`
is the supported entry point; an app image started on its own has nowhere to
write and will sit in its boot-time connect retry until it gives up.

## The two config lines that make it work

`next.config.ts` sets:

- `output: "standalone"` — Next emits `.next/standalone/` containing `server.js`
  plus only the `node_modules` actually reached at runtime, so the image doesn't
  ship the whole dependency tree.
- `serverExternalPackages: ["mysql2"]` — the driver resolves some internals
  dynamically, which the bundler cannot follow; leaving it external keeps it a
  plain runtime `require`.

## Image shape

Three stages: `deps` (npm ci), `build` (next build), `runtime` (copies only
`.next/standalone`, `.next/static`, `public`, and **`drizzle/`**). Runs as a
non-root `nextjs` user.

`drizzle/` is not optional. Migrations are applied on every boot by
`src/instrumentation.ts`, which resolves the folder relative to the working
directory — leave it out and the container starts against an unmigrated
database.

The image no longer declares a `VOLUME`, and there is no `DATABASE_PATH`. State
lives in the `db` service's `db-data` volume.

## Three runtime settings that bite

> [!warning] `HOSTNAME=0.0.0.0`
> The standalone server binds the machine's hostname by default, not
> `localhost`. Verified locally: it came up on `DESKTOP-UKLHBLU:3141` and
> `curl localhost:3141` refused the connection. Inside a container that means
> nothing outside can reach it. The Dockerfile sets `HOSTNAME=0.0.0.0`.

> [!warning] `DATABASE_URL` host is the service name
> Under compose it is `db`, not `localhost` — `localhost` inside the app
> container is the app container. Losing the database means losing the stored
> Hevy key, the cached catalog, and every plan with its `sync_links`. Losing
> `sync_links` is the expensive one: the app would then create **new** routines
> on the next sync instead of updating the existing ones, and the old ones can
> never be deleted ([[hevy-sync]]).

> [!warning] Never publish the database port
> `docker-compose.yml` deliberately gives the `db` service no `ports:` entry, so
> MariaDB is reachable only on the compose network. Adding `3306:3306` to get at
> it from the host is what turns a home server into an internet-exposed
> database. The test stack ([[testing-setup]]) is the one that publishes a port,
> and it holds nothing real.

## Start-order race, and why `depends_on` is not enough

MariaDB routinely takes seconds longer than the app to accept connections. The
compose file uses `depends_on: condition: service_healthy`, but that only covers
an orchestrated `compose up` — a bare `docker start`, a host reboot, or a
MariaDB restart underneath a running app all reintroduce the race.

So `src/lib/db/migrate.ts` retries the boot migration for up to 60s, but **only
on connection-phase error codes** (`ECONNREFUSED`, `ENOTFOUND`, …). A schema
error is permanent and is rethrown immediately — retrying it for a minute would
only delay a failure the operator needs to see. The Dockerfile's healthcheck
`start-period` is 90s to cover that window.

## Verified

`npm run build` passes, including TypeScript, and emits the standalone server.
Neither the Docker build nor `compose up` has been run here — **no Docker daemon
on this machine**, which is also why the DB-backed suites are unrun
([[testing-setup]]). The generated SQL was checked against the dialect instead,
see [[mariadb-migration]].

## Still open

The app has no authentication. Exposing it to the internet needs an external
auth gate (e.g. Cloudflare Access) in front of it — see [[product-architecture]].
Hosting vendor is still undecided.
