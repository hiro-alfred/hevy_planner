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

- [[hevy-platform]] — the Hevy app and its public API as the likely integration
  surface (UNVERIFIED domain context).
- [[llm-wiki-pattern]] — the Karpathy-style persistent synthesis layer this vault
  implements.

## systems/

- [[knowledge-wiki]] — the vault itself as a subsystem: layout, toolchain, manual
  setup steps.
- [[wiki-enforcement]] — the lint test and the read-guard hook that keep the vault
  honest.

## decisions/

- [[wiki-bootstrap]] — choices made at vault creation: categories, re-authored
  skills, thin bootstrap.
