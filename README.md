# Hevy Planner

A web dashboard that builds personalized workout plans and pushes them straight into
[Hevy](https://www.hevy.com) — the workout tracking app — via Hevy's official API.

> **Status: early scaffold.** The design below is agreed and the Next.js scaffold with
> stubbed services exists; the product features themselves are not implemented yet.

## Overview

Hevy Planner lets a user describe their training goal and constraints in plain terms —
body/fitness goal, time available per session, sessions per week, preferred split,
experience level, available equipment — and turns that into a structured workout plan.
An LLM generates the plan (exercises, sets, reps, and progression scheme), and the app
converts it into Hevy routines and syncs it directly to the user's Hevy account.

This requires a **Hevy Pro** subscription, since routine creation via the Hevy API is a
Pro-only capability.

## Features

- **Guided plan input** — capture goal, session length, sessions/week, split preference
  (e.g. push/pull/legs, upper/lower, full-body), experience level, and available
  equipment.
- **LLM-generated workout plans** — the inputs are turned into a structured plan
  (exercises, sets, reps, progression) by a large language model.
- **Hevy sync** — generated plans are converted into Hevy routines and pushed to the
  user's Hevy account through the official Hevy API.
- **In-app key management** — a settings page in the dashboard lets the user paste
  their own Hevy Pro API key, which is stored and used server-side only.
- **Provider-agnostic LLM layer** — the plan generator is not tied to one LLM vendor;
  the provider and API key are swappable via configuration.

## Architecture (planned)

- **Next.js full-stack app** (TypeScript, React) — a single codebase serving both the
  UI and the backend logic.
- **Server-side API routes** hold all secrets (Hevy API key, LLM API key); credentials
  never reach the client. The Hevy API key can be submitted through a dashboard
  settings page, which posts it to a server-side API route for server-side
  storage/use only.
- **Plan generation service** — turns structured user input into a structured workout
  plan via the Vercel AI SDK (provider-agnostic, Zod-validated structured output,
  streamed so the preview fills in progressively). Exercises are constrained to
  Hevy's real exercise-template catalog, cached locally, and validated after
  generation (ids resolve, day count matches, session length is plausible).
- **Hevy sync service** — converts a plan into Hevy routine payloads and pushes them.
  Sync is **create-once-then-update**: one routine folder per plan, one routine per
  training day, created on first sync with their Hevy ids recorded; later syncs
  `PUT`-replace those routines. (The Hevy API has no DELETE and a routine cap, so
  creating anew each time is not viable.) Syncing is always an explicit user action
  after preview — never automatic.
- **Storage** — MariaDB (via Drizzle, mysql dialect): settings (including the Hevy
  key), exercise-template catalog cache, plan history, synced routine ids. All
  weights are stored and synced in **kg** (the API's only unit); pounds are a
  display-only preference.
- **Deployment** — self-hosted on a persistent Linux server (budget VPS or a
  Raspberry Pi), not serverless: the app is a long-running Node process built with
  Next `output: 'standalone'`, shipped as a Docker container alongside a MariaDB
  container that owns the data volume (`docker-compose.yml`). Until multi-user auth
  exists, public exposure should sit behind an external gate (e.g. Cloudflare
  Access). No infrastructure has been provisioned yet.
- **Mobile** — not part of the initial build. A PWA or React Native path is a possible
  future direction, not a current commitment.

## Planned tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (TypeScript, React) |
| API layer | Next.js route handlers + server actions (server-side only) |
| Database | MariaDB + Drizzle ORM (mysql dialect, `mysql2` driver) |
| Workout data | Hevy API (requires Hevy Pro API key; spec pinned at `docs/hevy-openapi.json`) |
| Plan generation | Vercel AI SDK (provider-agnostic; Zod structured output) |
| Deployment target | Self-hosted persistent server (budget VPS / Raspberry Pi), Docker + Next standalone |

## Setup

The app needs a MariaDB server; it cannot create one for itself. Schema migrations are
applied automatically on every server boot, so there is no manual migration step.

- **Everything at once (recommended):** `docker compose up --build` starts MariaDB and
  the app together on <http://localhost:3000>. Copy `.env.example` to `.env` and set
  `MARIADB_PASSWORD` / `MARIADB_ROOT_PASSWORD` first — the built-in defaults are
  throwaway values, fine for a local try-out and not for anything reachable from
  outside the host.
- **App only (Node ≥ 20):** `npm install`, point `DATABASE_URL` at a reachable MariaDB,
  then `npm run dev` (or `npm run build && npm start`). All application dependencies are
  declared in `package.json`.
- **Tests:** `npm run test:db:up` once to start a throwaway MariaDB on port 3307, then
  `npm test`. Each test file creates and drops its own database on that server, so runs
  never share state. `npm run test:db:down` stops it. Docker is required; to use your
  own server instead, set `TEST_DATABASE_URL` (it will `CREATE` and `DROP` databases).
- **Dev tooling (Python, optional):** `pip install -r requirements.txt` — needed only to
  run the knowledge-wiki lint tests (`python -m pytest tests/`).

## Configuration

The primary way to supply a Hevy Pro API key is the dashboard's **settings page**: the
user pastes their key there, it is submitted to a server action, and stored and used
server-side only — it is never exposed back to the browser or used client-side. The UI
only ever sees whether a key is set plus its last four characters.

The key is **encrypted at rest** with AES-256-GCM under `SETTINGS_ENCRYPTION_KEY`, so a
database dump, backup, or snapshot does not reveal it. Note the limit honestly: the
encryption key lives in the app's environment, so this protects against a
database-only compromise, not against someone who owns the app host. Hashing is not an
option here — unlike a password, the key must be replayed to Hevy on every request and
therefore has to be reversible.

`.env` remains available for local/deployment-level configuration and is **never
committed**. `.env.example` documents the expected variables:

| Variable | Purpose |
|---|---|
| `HEVY_API_KEY` | *(optional)* Hevy Pro API key used as a fallback/default when none has been entered via the settings page |
| `LLM_PROVIDER` | *(optional)* LLM provider for plan generation. Defaults to `anthropic` |
| `LLM_MODEL` | *(optional)* Model id for that provider. Defaults to `claude-opus-5` |
| `LLM_API_KEY` | *(optional)* API key for the configured provider. **Without it the app still works** — plans come from the deterministic built-in generator instead |
| `SETTINGS_ENCRYPTION_KEY` | 32-byte base64/hex key encrypting the stored Hevy key at rest (AES-256-GCM). Strongly recommended — without it the key sits in the database in plaintext. Required by `docker-compose.yml` |
| `DATABASE_URL` | MariaDB connection string, e.g. `mysql://hevy:pw@db:3306/hevy_planner`. Required in any real deployment; defaults to a localhost dev database |
| `MARIADB_PASSWORD` | Password for the `hevy` user in the `docker-compose.yml` database container |
| `MARIADB_ROOT_PASSWORD` | Root password for that same container |
| `TEST_DATABASE_URL` | *(optional)* MariaDB the test suite may create and drop databases on. Defaults to the throwaway server in `docker-compose.test.yml` |

Weights are handled in **kg by default** (Hevy's API is kg-only); a display-only
lbs preference is planned in settings.

This is a **personal, single-user tool**: the owner sets their Hevy key through the
in-app settings page rather than editing `.env` directly; `.env` remains available as
an optional default. A later phase may let users supply their own LLM key from the UI
as well, instead of `.env`.

## Authentication

The whole app is behind a login. Every page, every server action and every route
handler requires a session; the only public paths are `/login` and the two OAuth
legs under `/api/auth/`.

> **Consider not using this at all.** Putting **Cloudflare Access** or **Tailscale**
> in front of the app gives the same protection with zero application code and
> nothing here to maintain or get wrong — no OAuth client to rotate, no session
> secret to keep, no allowlist to edit. In-app auth is worth it only if the app must
> be reachable from a plain browser on an untrusted network. Judge that first.

### It refuses to serve when unconfigured

Unlike the rest of this project, a missing auth configuration is **not** a silent
degradation. The app answers every request with **HTTP 503** and names the variables
it is missing. That is deliberate: `LLM_API_KEY` quietly falls back to rule-based
plans and `SETTINGS_ENCRYPTION_KEY` quietly stores the Hevy key in plaintext, and
"looks healthy while unprotected" is the exact failure this app cannot afford — it
holds a Hevy Pro key and can create routines that the Hevy API has **no endpoint to
delete**.

### Choose a provider

**Google (recommended).** Real federated identity, and Google permits
`http://localhost` redirect URIs so it can be tested locally. What the owner must do:

1. Go to <https://console.cloud.google.com/apis/credentials>, and create a project if
   there is not one already.
2. **Configure the OAuth consent screen.** "External" is fine; it can stay in
   *Testing* with the owner as the only test user — no verification review needed.
3. **Create credentials → OAuth client ID → Application type: Web application.**
4. Under *Authorised redirect URIs* add exactly:
   `<AUTH_ORIGIN>/api/auth/callback/google` — e.g.
   `http://localhost:3000/api/auth/callback/google`. It must match character for
   character, including the scheme and port.
5. Copy the **Client ID** and **Client secret** back into `.env`.

The values needed are then:

| Variable | Value |
| --- | --- |
| `AUTH_SESSION_SECRET` | 32 random bytes: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` |
| `GOOGLE_CLIENT_ID` | from step 5 |
| `GOOGLE_CLIENT_SECRET` | from step 5 |
| `AUTH_ORIGIN` | the app's public origin, no trailing path (`http://localhost:3000`) |
| `AUTH_ALLOWED_EMAILS` | comma-separated allowlist, e.g. the owner's Google address |

Sign-in uses the authorization-code flow with PKCE; the `id_token` is verified
against Google's JWKS (RS256, plus `iss`/`aud`/`exp`/`nonce`), and the address must
be `email_verified` **and** on `AUTH_ALLOWED_EMAILS`. An empty allowlist is refused
at boot rather than admitting every Google account in existence.

**Hevy API key (fallback).** Hevy publishes **no OAuth** — the pinned spec in
`docs/hevy-openapi.json` has 14 paths, no token endpoint and no `securitySchemes`,
only an `api-key` header on all 22 authenticated operations. So this mode is a
**shared-secret password gate, not identity**: the visitor pastes a key, the server
spends it on `GET /v1/user/info`, and the returned `data.id` is checked against
`AUTH_ALLOWED_HEVY_USER_IDS`. Anyone holding the key is the owner as far as the app
can tell, and signing out cannot revoke it — rotate the key in the Hevy app for that.
Its one merit is needing no external setup, which makes it the way to try the gate
before creating an OAuth client. Find your id with:

```bash
curl -H "api-key: <your key>" https://api.hevyapp.com/v1/user/info
```

Set `AUTH_ALLOWED_HEVY_USER_IDS` (and `AUTH_SESSION_SECRET`) and this mode is
selected automatically. Set `AUTH_PROVIDER` only if both providers are configured.

**Apple** is not implemented. It requires a paid Apple Developer account, so it needs
the owner's confirmation before it is worth building.

### Running unauthenticated, locally

`AUTH_DISABLED=true` runs the app with no gate. It is **refused when
`NODE_ENV=production`**, it is not forwarded by `docker-compose.yml`, and every page
carries an `AUTH DISABLED` badge in the header so an open instance can never be
mistaken for a protected one. Use it for local development only.

### Sessions

An encrypted (AES-256-GCM) `HttpOnly`, `SameSite=Lax` cookie, `Secure` in production,
holding only the provider, subject, label and expiry. There is no sessions table:
with one user, "sign out everywhere" is rotating `AUTH_SESSION_SECRET`, which
invalidates every token ever issued. `AUTH_SESSION_TTL_HOURS` defaults to 720 hours
(30 days).

| Variable | Purpose |
| --- | --- |
| `AUTH_SESSION_SECRET` | **Required.** 32 bytes, base64 or hex. Its own secret — never reuse `SETTINGS_ENCRYPTION_KEY` |
| `AUTH_PROVIDER` | *(optional)* `google` or `hevy-key`; only needed to disambiguate |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_ORIGIN` / `AUTH_ALLOWED_EMAILS` | Google sign-in |
| `AUTH_ALLOWED_HEVY_USER_IDS` | Hevy-key gate |
| `AUTH_SESSION_TTL_HOURS` | *(optional)* session lifetime, default 720 |
| `AUTH_DISABLED` | *(optional)* `true` disables auth; development only |

## Repository structure

- `src/` — the Next.js app: `app/` (pages and server actions), `components/`
  (shared UI), `lib/db/` (Drizzle schema + client), `lib/hevy/` (API client,
  catalog cache, sync service), `lib/planner/` (plan schema, split mapping,
  rule-based and LLM generators, validation, Hevy payload mapping).
- Tests live beside the code as `*.test.ts` (vitest, `npm test`).
- `docs/hevy-openapi.json` — pinned copy of the official Hevy OpenAPI spec that the
  client types are checked against.
- `knowledge/` — an internal Obsidian-vault knowledge wiki used by AI coding agents
  working in this repo (a synthesis layer over `CLAUDE.md` and docs, per the Karpathy
  LLM-wiki pattern). It is developer/agent tooling, not part of the product; the code
  and docs remain the source of truth.

## Repository conventions

- No source file should exceed 300 lines.
- No N+1 query problems.
- No inline JS or CSS.

## Roadmap

- **Phase 1 — Personal dashboard.** Single-user tool: input training parameters,
  generate a plan via LLM, sync it to the owner's Hevy account. Hevy key entered via
  the in-app settings page (stored server-side only), with `.env` as an optional
  fallback.
- **Phase 2 — Multi-user.** Accounts/auth so multiple users can each connect their own
  Hevy account and generate their own plans.
- **Phase 3 — Possible mobile app.** PWA or React Native client, if warranted.

## Not this

Hevy Planner is a custom TypeScript/React web application — it is **not** WordPress-based
and does not use a CMS.
