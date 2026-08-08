---
title: LLM-wiki pattern
aliases: [LLM wiki, Karpathy wiki pattern, synthesis layer]
tags: [concept, meta, workflow]
type: concept
created: 2026-08-08
updated: 2026-08-08
sources: [CLAUDE.md, knowledge/schema.md]
---

# LLM-wiki pattern

The idea (popularized by Andrej Karpathy) behind this vault: an LLM working in a repo
accumulates understanding that dies with each session's context window. An **LLM-wiki**
fixes that by giving the LLM a *persistent synthesis layer* — a small wiki it maintains
across sessions the way a disciplined human maintainer would.

## The three commitments

1. **Synthesis, not storage.** Pages distill and connect what the code/docs mean; they
   never become a second copy of the source. On conflict the source wins and the wiki
   page is by definition stale ([[schema]], source-of-truth rule).
2. **Discipline over sprawl.** One page per concept, hard line caps, mandatory
   frontmatter, no orphans — kept honest by an executable lint contract
   ([[wiki-enforcement]]) rather than good intentions.
3. **Session continuity.** A single working-memory page, [[hot]], is read first every
   session and overwritten at every wrap-up, so a new context window resumes exactly
   where the last one stopped. Durable history goes to [[log]] instead.

## Why Obsidian

The vault is plain markdown with wikilinks, so it degrades gracefully to grep — but
opened in Obsidian it gains a graph view, backlinks, and a CLI
(`obsidian vault="knowledge" …`) that agents use as the primary query path
([[knowledge-wiki]]).

## In this repo

`knowledge/` is that vault for hevy_planner ([[project-overview]]). The rules live in
[[schema]]; the bootstrap rationale lives in [[wiki-bootstrap]].
