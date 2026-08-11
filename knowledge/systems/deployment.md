---
title: Deployment — standalone build, Docker image, and the MariaDB service
aliases: [deploy, docker, dockerfile, standalone, hosting, compose, docker-compose]
tags: [subsystem, deployment, docker, ops, mariadb]
type: subsystem
created: 2026-08-08
updated: 2026-08-11
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

## …and a third that only matters in dev

`allowedDevOrigins: ["192.168.0.*"]` is the third key in `next.config.ts` and has no
effect on the built image. `next dev` answers `/_next/*` **and the HMR WebSocket
upgrade** with 403 for any `Origin` other than the host it was started on
(`localhost`), so opening the dev server at the machine's LAN address — from a
phone, or another desktop — yields a page whose dev assets all fail and whose hot
reload never connects. Next's `blockCrossSiteDEV` compares the request `Origin`
(falling back to `Referer` for no-cors loads) against `localhost`, the `-H`
hostname, and this list; patterns are matched segment-wise, so the wildcard
survives a DHCP lease change. Editing `next.config.ts` restarts the dev server by
itself. Verified 2026-08-11: a request to `/_next/static/…` carrying
`Origin: http://192.168.0.9:3000` returns 404 — routed normally — instead of 403.

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

`public/` exists only as a `.gitkeep`. The app keeps its favicon in `src/app/`
as App Router metadata, so the directory holds nothing — but the first real
build failed on `COPY /app/public`, because COPY errors out on a missing source
rather than skipping it. The directory has to exist for the runtime stage to
assemble at all.

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

**The container path now runs.** 2026-08-09, Docker Desktop 4.85.0 / engine
29.6.2 / compose v5.3.1 on the Windows dev box:

- `docker compose build` succeeds — after the `public/` fix above, which is the
  one thing reasoning had missed.
- `docker compose up -d --wait` reports both services healthy. The `db`
  healthcheck goes healthy first and the app starts after it, so the
  `depends_on: service_healthy` ordering does what it claims.
- The boot migration builds the whole schema on an empty `db-data` volume:
  `__drizzle_migrations`, `exercise_templates`, `plans`, `settings`,
  `sync_links`. It emits no log line, so the tables are the evidence, not the
  output.
- `/`, `/plans/new` and `/settings` all answer 200 through the published port,
  which also confirms `HOSTNAME=0.0.0.0` end to end.
- The suite runs green against the pinned **11.4** image (103/103 via the test
  stack on 3307), so the 12.3-local-vs-11.4-pinned gap is closed rather than
  merely assumed harmless.

What is still unobserved: the boot-migration **retry** path. Nothing has yet
started the app against a database that was not already accepting connections,
so the 60s connection-phase retry in `src/lib/db/migrate.ts` has never fired.
The orchestrated `compose up` is exactly the case `depends_on` already covers.

## Getting a daemon on the dev machine

The Windows box had no Docker because it had no hypervisor: VT-x and SLAT are
available in firmware, but `Microsoft-Windows-Subsystem-Linux` and
`VirtualMachinePlatform` were both disabled and `wsl.exe` was the inbox stub
(it prints usage for `--status` and ignores `WSL_UTF8` — neither means WSL is
broken, only that it is not installed). Enabling both with
`dism /online /enable-feature /all /norestart` returns 3010 — success, reboot
required — and nothing works until that reboot, because the hypervisor does not
start before it. `HypervisorPresent` on `Win32_ComputerSystem` is the check that
says whether it did. After the reboot: `wsl --update` (kernel 6.18, WSL 2.7.11),
`wsl --set-default-version 2`, then `winget install -e --id Docker.DockerDesktop`
and one launch of Docker Desktop. No user distro is needed — Docker Desktop
brings its own `docker-desktop` WSL image, and the engine came up without the
subscription dialog blocking it. Windows 10 Pro 22H2 build 19045 is above
Docker Desktop's floor.

Prove the daemon on the throwaway stack first — `npm run test:db:up`
([[testing-setup]]) publishes 3307 and holds nothing real, so a mistake there
costs nothing. Only then `compose up` against the volume that carries the
encrypted Hevy key ([[key-handling]]).

## Still open

The app has no authentication. Exposing it to the internet needs an external
auth gate (e.g. Cloudflare Access) in front of it — see [[product-architecture]].
Hosting vendor is still undecided.
