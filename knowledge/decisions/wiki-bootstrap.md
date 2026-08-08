---
title: Wiki bootstrap decisions
aliases: [bootstrap decisions, vault bootstrap]
tags: [decision, meta]
type: design
created: 2026-08-08
updated: 2026-08-08
sources: [README.md, knowledge/schema.md]
---

# Wiki bootstrap decisions

Choices made on 2026-08-08 when this vault was created, and why. Context:
[[project-overview]]; pattern: [[llm-wiki-pattern]].

## Categories: overview / concepts / systems / decisions

The source setup used `overview, rules, concepts, systems`. `rules/` was replaced with
`decisions/` because a greenfield planner project accumulates architecture and scope
*decisions* long before it accumulates domain *rules*. If rule-like invariants emerge
later (e.g. programming constraints a generated plan must satisfy), either file them
under `concepts/` or add a category — which requires updating both [[schema]] and the
`CATEGORIES` set in the lint test ([[wiki-enforcement]]) in the same commit.

## Skills were re-authored, not copied

The instruction was to copy `.claude/skills/obsidian-cli/` and
`.claude/skills/obsidian-markdown/` verbatim from `d:\Projects\final-check-automation`.
That path is a local Windows drive, unreachable from the cloud environment that ran
the bootstrap, so both skills were written fresh to the same generic spec (CLI query
verbs with `key=value` args; Obsidian markdown authoring conventions). **Follow-up**:
diff them against the originals when working on a machine that has the source repo,
and reconcile.

## Bootstrap pages are thin by design

The repo had no code at bootstrap time, so the initial pages capture the wiki
infrastructure itself plus inferred domain context ([[hevy-platform]], explicitly
flagged UNVERIFIED). Real subsystem pages should be added as real subsystems appear —
ingest per [[schema]], one line per ingest in [[log]].
