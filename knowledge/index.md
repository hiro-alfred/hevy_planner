---
title: Index — vault hub
aliases: [index, hub, catalog]
tags: [hub]
type: hub
created: 2026-08-08
updated: 2026-08-08
sources: [knowledge/]
---

# Index

Hub for the hevy_planner knowledge vault: every page, one line each, grouped by
category. Start here; conventions live in [[schema]].

## Root specials

- [[schema]] — how this vault works: categories, page conventions, operations.
- [[hot]] — session working memory; read FIRST every session, overwritten at wrap-up.
- [[log]] — append-only journal of ingests, queries, and lint passes.
- [[log-archive]] — entries rotated out of the log to respect the 300-line cap.

## overview/

- [[project-overview]] — what hevy_planner is, what exists today (greenfield), where
  it is headed.

## concepts/

- [[hevy-platform]] — the Hevy app and its public API as the integration surface
  (domain context; API sketch superseded by [[hevy-api]] where they differ).
- [[hevy-api]] — VERIFIED API surface from the pinned OpenAPI spec
  (docs/hevy-openapi.json): write schema, no-DELETE, traps.
- [[llm-wiki-pattern]] — the Karpathy-style persistent synthesis layer this vault
  implements.

## systems/

- [[knowledge-wiki]] — the vault itself as a subsystem: layout, toolchain, manual
  setup steps.
- [[wiki-enforcement]] — the lint test and the read-guard hook that keep the vault
  honest.
- [[catalog-service]] — the local exercise-template cache: refresh contract,
  one-query candidate filtering, MariaDB traps.
- [[testing-setup]] — vitest for app logic, pytest for the vault; how to test
  DB-backed modules against the throwaway MariaDB the suite needs.
- [[key-handling]] — the four barriers that keep the Hevy API key off the client,
  the env fallback, and the settings page surface.
- [[plan-generation]] — the rule-based and LLM generators behind one entry point,
  the volume model, and post-validation.
- [[hevy-sync]] — create-once-then-PUT, content hashing, and why a duplicate
  routine is unrecoverable.
- [[deployment]] — standalone build, Docker image shape, the runtime settings
  that break it, and getting a daemon onto the dev machine.

## decisions/

- [[product-architecture]] — 2026-08-08 stack decisions: Next.js full-stack (not
  WordPress), personal-first, AI-SDK LLM layer, in-app Hevy key entry, self-hosted
  persistent server (not serverless), MariaDB + Drizzle.
- [[plan-pipeline]] — round-2 core-flow design: 4-stage pipeline, JSON plan doc +
  sync_links, create-once-then-PUT sync, minimal-plus editing, kg-only units.
- [[mariadb-migration]] — 2026-08-08 move off SQLite: what it cost, the dialect
  traps (drizzle's `json()` does not round-trip on MariaDB), verification status.
- [[wiki-bootstrap]] — choices made at vault creation: categories, re-authored
  skills, thin bootstrap.
