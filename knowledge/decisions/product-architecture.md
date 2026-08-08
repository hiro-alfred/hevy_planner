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
  the browser, deploys to Vercel or similar, and leaves a PWA/React Native path for a
  future mobile app. WordPress would fight secret management, async API calls, and
  the repo's no-inline-JS/CSS rule.
- **Personal single-user tool first.** No auth in phase 1; multi-user accounts are
  phase 2, mobile a possible phase 3.
- **Provider-agnostic LLM layer.** Owner has not picked a provider. The plan
  generator sits behind an abstraction configured by `LLM_PROVIDER` / `LLM_API_KEY`
  in `.env`; a later option is user-supplied LLM keys via the UI.
- **Hevy API key entered in-app.** Primary path is a dashboard settings page posting
  the key to a server-side route, stored/used server-side only, never echoed to the
  client. `HEVY_API_KEY` in `.env` is an optional fallback. `.gitignore` covers
  `.env`, `.env.local`, `.env*.local`; a committed `.env.example` documents the vars.
- **Code standards (in CLAUDE.md).** Max 300 lines of code per file, no N+1 query
  problems, no inline JS or CSS.

## Open

- LLM provider choice (deliberately deferred).
- Server-side storage mechanism for the in-app Hevy key (file, DB, encrypted store).
