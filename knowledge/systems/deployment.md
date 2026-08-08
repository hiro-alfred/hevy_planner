---
title: Deployment — standalone build and Docker image
aliases: [deploy, docker, dockerfile, standalone, hosting]
tags: [subsystem, deployment, docker, ops]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [Dockerfile, .dockerignore, next.config.ts, src/instrumentation.ts]
---

# Deployment

Self-hosted, persistent server — not serverless. That was decided in
[[product-architecture]] and the reason is [[catalog-service]] and the settings
table: SQLite on a mounted volume needs a process with a durable disk.

## The two config lines that make it work

`next.config.ts` sets:

- `output: "standalone"` — Next emits `.next/standalone/` containing `server.js`
  plus only the `node_modules` actually reached at runtime, so the image doesn't
  ship the whole dependency tree.
- `serverExternalPackages: ["better-sqlite3"]` — the native module must be
  `require`d by Node at runtime, not bundled, or the `.node` binding is lost.

## Image shape

Three stages: `deps` (npm ci), `build` (next build), `runtime` (copies only
`.next/standalone`, `.next/static`, `public`, and **`drizzle/`**). Runs as a
non-root `nextjs` user, since the database file holds the Hevy API key in
plaintext ([[key-handling]]).

`drizzle/` is not optional. Migrations are applied on every boot by
`src/instrumentation.ts`, which resolves the folder relative to the working
directory — leave it out and the container starts against an unmigrated
database.

## Two runtime settings that bite

> [!warning] `HOSTNAME=0.0.0.0`
> The standalone server binds the machine's hostname by default, not
> `localhost`. Verified locally: it came up on `DESKTOP-UKLHBLU:3141` and
> `curl localhost:3141` refused the connection. Inside a container that means
> nothing outside can reach it. The Dockerfile sets `HOSTNAME=0.0.0.0`.

> [!warning] `/data` must be a real volume
> `DATABASE_PATH=/data/hevy-planner.sqlite` and `VOLUME ["/data"]`. Without a
> mounted volume every deploy starts from an empty database — the stored Hevy
> key, the cached catalog, and every plan and its `sync_links` are lost. Losing
> `sync_links` is the expensive one: the app would then create **new** routines
> on the next sync instead of updating the existing ones, and the old ones can
> never be deleted ([[hevy-sync]]).

## Verified

`npm run build` then running `.next/standalone/server.js` with the image's file
layout: boots, applies all migrations to a fresh database, and serves `/`,
`/settings`, and `/plans/new`. The Docker build itself has not been run here —
no Docker daemon on this machine.

## Still open

The app has no authentication. Exposing it to the internet needs an external
auth gate (e.g. Cloudflare Access) in front of it — see [[product-architecture]].
Hosting vendor is still undecided.
