---
title: Deployment — standalone build, Docker image, and the MariaDB service
aliases: [deploy, docker, dockerfile, standalone, hosting, compose, docker-compose]
tags: [subsystem, deployment, docker, ops, mariadb]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [Dockerfile, docker-compose.yml, .dockerignore, .env.example, next.config.ts, src/instrumentation.ts, src/lib/db/migrate.ts, src/lib/planner/provider.ts]
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

## The app container only sees what compose lists

There is no `env_file:` on the `app` service, so the container's environment is
exactly the `environment:` block — a variable present in `.env` but absent from
that list simply does not exist inside the container. That is a silent failure
mode for the LLM in particular: with no `LLM_API_KEY` the app does not error, it
falls back to the deterministic generator ([[plan-generation]]), so the stack
looks healthy while producing rule-based plans. The block passes the whole
`LLM_*` family (`LLM_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_THINKING`,
`LLM_REASONING_EFFORT`) as read by `src/lib/planner/provider.ts`. It briefly
passed `ANTHROPIC_API_KEY` instead, left over from before the provider became
configurable — a name nothing reads any more.

The published host port is `${APP_PORT:-3000}`. The server always listens on
3000 inside the container (`PORT` in the Dockerfile); `APP_PORT` moves only the
host side, for the common case where a dev server already holds 3000.

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
The app itself is verified end to end against a real MariaDB — all routes, the
boot migration, and 63/63 tests ([[mariadb-migration]]).

> [!warning] The container path is still unobserved
> Neither the Docker build nor `compose up` has been run. So the compose wiring,
> the `depends_on` healthcheck, and the boot-migration retry are reasoned-about,
> not tested. Local dev uses a natively-installed MariaDB on 3306 instead, and
> runs 12.3 (rolling) against the 11.4 (LTS) pinned in the compose files. Treat
> the first `compose up` as unproven ground.

## Getting a daemon on the dev machine

The Windows box had no Docker because it had no hypervisor: VT-x and SLAT are
available in firmware, but `Microsoft-Windows-Subsystem-Linux` and
`VirtualMachinePlatform` were both disabled and `wsl.exe` was the inbox stub
(it prints usage for `--status` and ignores `WSL_UTF8` — neither means WSL is
broken, only that it is not installed). Both features are now **Enabled** via
`dism /online /enable-feature /all /norestart`, which returned 3010: success,
reboot required. Until that reboot the hypervisor does not start, so
`wsl --update`, `wsl --install -d Ubuntu` and the Docker Desktop install all
have to wait. Windows 10 Pro 22H2 build 19045 is above Docker Desktop's floor.

Prove the daemon on the throwaway stack first — `docker compose -f
docker-compose.test.yml up -d` ([[testing-setup]]) publishes 3307 and holds
nothing real, so a mistake there costs nothing. Only then `compose up --build`
against the volume that carries the encrypted Hevy key ([[key-handling]]).

## Still open

The app has no authentication. Exposing it to the internet needs an external
auth gate (e.g. Cloudflare Access) in front of it — see [[product-architecture]].
Hosting vendor is still undecided.
