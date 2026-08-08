---
title: Project overview — hevy_planner
aliases: [hevy_planner, project overview]
tags: [overview, status]
type: hub
created: 2026-08-08
updated: 2026-08-08
sources: [README.md]
---

# Project overview

**hevy_planner** is a workout-plan builder targeting the Hevy training app
([[hevy-platform]]). As of 2026-08-08 the repository is **greenfield**: the only
content besides this knowledge vault is a one-line `README.md` (`# hevy_planner`) —
no application code, no dependencies, no docs yet.

## What exists today

- `README.md` — project name only.
- `knowledge/` — this wiki, an LLM-maintained synthesis layer ([[knowledge-wiki]]).
- `tests/test_knowledge_wiki.py` + `.claude/hooks/wiki-read-guard.sh` — the wiki's
  enforcement layer ([[wiki-enforcement]]).
- `.claude/skills/obsidian-cli/`, `.claude/skills/obsidian-markdown/` — the querying
  and authoring skills the wiki depends on.
- `CLAUDE.md` — agent instructions, including the wiki query protocol.

## What the project is expected to become

Inferred from the repo name only (UNVERIFIED — confirm with the owner): a tool that
plans/generates workout routines and pushes them to, or reads training history from,
Hevy — most likely via the Hevy public API ([[hevy-platform]]). No architecture has
been decided yet; when it is, record it under `decisions/` per [[schema]].

## Where to go next

- Vault conventions and operations: [[schema]]
- Current session state: [[hot]]
- Bootstrap choices and their rationale: [[wiki-bootstrap]]
