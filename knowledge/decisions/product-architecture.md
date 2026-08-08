---
title: Product architecture — stack and key-handling decisions
aliases: [product architecture, architecture decisions, stack choice]
tags: [architecture, decisions, stack]
type: design
created: 2026-08-08
updated: 2026-08-08
sources: [README.md, CLAUDE.md, .gitignore]
---

# Product architecture decisions

Decided with the owner on 2026-08-08 (session recorded in [[log]]). `README.md` is the
authoritative design doc; this page holds the rationale. Supersedes the "no
architecture decided yet" state in [[project-overview]].

## What the product is

A web dashboard that takes a user's body goal and training parameters (session
length, sessions/week, split preference, experience, equipment), has an LLM generate
a structured workout plan, and pushes it as routines to the user's Hevy account via
the official Hevy API ([[hevy-platform]] — requires Hevy Pro).

## Decisions and rationale

- **Next.js full-stack (TypeScript/React), NOT WordPress.** It is an API-driven
  interactive dashboard, not a content site: server-side API routes keep secrets off
  the browser, and leaves a PWA/React Native path for a future mobile app. WordPress
  would fight secret management, async API calls, and the repo's no-inline-JS/CSS
  rule.
- **Self-hosted persistent server, NOT Vercel/serverless** (round 2, 2026-08-08).
  Vendor deliberately open (budget VPS, netcup likely; owner's Raspberry Pi viable);
  what is locked is the *model*: long-running `next start` on a persistent Linux box
  with a disk. Portability habits from day one: Next `output: 'standalone'` +
  Dockerfile, so deploy = run a container next to a volume anywhere. Consequence:
  the phase-1 no-auth app must sit behind an external gate (e.g. Cloudflare
  Access) when exposed publicly.
- **SQLite + Drizzle for all phase-1 state** — Hevy key, plan history, catalog
  cache, synced routine ids. Near-zero ops on a persistent box; swaps to Postgres
  at phase-2 multi-user. Schema and rationale in [[plan-pipeline]].
- **Personal single-user tool first.** No auth in phase 1; multi-user accounts are
  phase 2, mobile a possible phase 3.
- **Provider-agnostic LLM layer via the Vercel AI SDK** (round 2). Owner has not
  picked a provider; the AI SDK *is* the abstraction (swap providers by config,
  structured output via Zod), so we don't hand-roll one. Env contract unchanged:
  `LLM_PROVIDER` / `LLM_API_KEY`; later option is user-supplied LLM keys via UI.
- **Hevy API key entered in-app.** Primary path is a dashboard settings page posting
  the key to a server-side route, stored/used server-side only, never echoed to the
  client. `HEVY_API_KEY` in `.env` is an optional fallback. `.gitignore` covers
  `.env`, `.env.local`, `.env*.local`; a committed `.env.example` documents the vars.
- **Code standards (in CLAUDE.md).** Max 300 lines of code per file, no N+1 query
  problems, no inline JS or CSS.

Round-2 additions (core flow, data model, sync semantics, edit scope, key storage,
kg-only units) live in [[plan-pipeline]], grounded in the verified [[hevy-api]].

## Open

- LLM provider choice (deliberately deferred; abstracted by the AI SDK).
- VPS vendor (netcup likely; decision deferred until first deploy — architecture
  only assumes "persistent Linux server").
