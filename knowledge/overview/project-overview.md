---
title: Project overview — hevy_planner
aliases: [hevy_planner, project overview]
tags: [overview, status]
type: hub
created: 2026-08-08
updated: 2026-08-08
sources: [README.md, CLAUDE.md, .gitignore]
---

# Project overview

**hevy_planner** is a workout-plan builder targeting the Hevy training app
([[hevy-platform]]). As of 2026-08-08 the repository is **greenfield on the code
side**: no application code or dependencies yet, but the product and technical design
are decided and documented in `README.md` ([[product-architecture]]).

## What exists today

- `README.md` — full design doc: product description, planned Next.js architecture,
  configuration, roadmap.
- `.gitignore` — ignores `.env` / `.env.local` / `.env*.local` (secrets).
- `knowledge/` — this wiki, an LLM-maintained synthesis layer ([[knowledge-wiki]]).
- `tests/test_knowledge_wiki.py` + `.claude/hooks/wiki-read-guard.sh` — the wiki's
  enforcement layer ([[wiki-enforcement]]).
- `.claude/skills/obsidian-cli/`, `.claude/skills/obsidian-markdown/` — the querying
  and authoring skills the wiki depends on.
- `CLAUDE.md` — agent instructions: wiki query protocol plus code standards (≤300
  lines of code per file, no N+1 queries, no inline JS/CSS).

## What the project will become

Confirmed by the owner (2026-08-08): a Next.js web dashboard that turns a user's body
goal and training parameters into an LLM-generated workout plan and syncs it as
routines to their Hevy account via the Hevy API ([[hevy-platform]]). Phase 1 is a
personal single-user tool; multi-user and mobile come later. Full rationale in
[[product-architecture]].

## Where to go next

- Vault conventions and operations: [[schema]]
- Current session state: [[hot]]
- Bootstrap choices and their rationale: [[wiki-bootstrap]]
