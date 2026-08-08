# Hevy Planner

A web dashboard that builds personalized workout plans and pushes them straight into
[Hevy](https://www.hevy.com) — the workout tracking app — via Hevy's official API.

> **Status: greenfield.** This repository currently contains no application code. This
> README describes the agreed product and technical design that implementation will
> follow. Sections describing the tech stack, architecture, and configuration are the
> **plan**, not a description of what exists today.

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
- **Plan generation service** — an internal abstraction that turns structured user
  input into a structured workout plan by calling out to a configured LLM provider.
- **Hevy sync service** — converts a generated plan into Hevy routine payloads and
  calls the Hevy API to create/update routines in the user's account.
- **Deployment** — designed to deploy to Vercel or an equivalent platform; no
  infrastructure has been provisioned yet.
- **Mobile** — not part of the initial build. A PWA or React Native path is a possible
  future direction, not a current commitment.

## Planned tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (TypeScript, React) |
| API layer | Next.js API routes (server-side only) |
| Workout data | Hevy API (requires Hevy Pro API key) |
| Plan generation | LLM behind a provider-agnostic abstraction |
| Deployment target | Vercel or similar |

No package.json, dependency choices, or scaffolding exist yet — this table reflects the
agreed direction, to be filled in as implementation starts.

## Configuration

The primary way to supply a Hevy Pro API key is the dashboard's **settings page**: the
user pastes their key there, it is submitted to a server-side API route, and stored/used
server-side only — it is never exposed back to the browser or used client-side.

`.env` remains available for local/deployment-level configuration and is **never
committed**. A `.env.example` file documents the expected variables (to be added
alongside the first implementation).

Expected environment variables:

| Variable | Purpose |
|---|---|
| `HEVY_API_KEY` | *(optional)* Hevy Pro API key used as a fallback/default when none has been entered via the settings page |
| `LLM_PROVIDER` | Selects which LLM provider the plan generator calls |
| `LLM_API_KEY` | API key for the configured LLM provider |

In the initial phase this is a **personal, single-user tool**: the app has no
login/auth system yet, but the owner can still set their Hevy key through the in-app
settings page rather than editing `.env` directly; `.env` remains available as an
optional default. A later phase may let users supply their own LLM key from the UI as
well, instead of `.env`.

## Repository structure

- `knowledge/` — an internal Obsidian-vault knowledge wiki used by AI coding agents
  working in this repo (a synthesis layer over `CLAUDE.md` and docs, per the Karpathy
  LLM-wiki pattern). It is developer/agent tooling, not part of the product; the code
  and docs remain the source of truth.
- Application source does not exist yet.

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
