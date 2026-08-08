---
title: Wiki enforcement — lint test and read guard
aliases: [wiki lint, read guard, wiki test]
tags: [subsystem, testing, tooling]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [tests/test_knowledge_wiki.py, .claude/hooks/wiki-read-guard.sh, .claude/settings.json]
---

# Wiki enforcement

Two mechanisms turn the [[schema]] rules from prose into behavior for the
[[knowledge-wiki]] subsystem.

## Lint test — `tests/test_knowledge_wiki.py`

Run with `python -m pytest tests/test_knowledge_wiki.py`. It is the executable half of
the vault contract; run it after every ingest and during every lint pass. It checks:

- vault exists and has an index; page names unique vault-wide (wikilinks resolve by
  name alone);
- root holds only the five specials; every other page sits one level deep in a known
  category (`overview`, `concepts`, `systems`, `decisions`);
- every page has the seven required frontmatter keys;
- every wikilink resolves; no orphans (all pages reachable from [[index]]); every page
  is cataloged in the index and has at least one outgoing link;
- 300-line cap on every page; the five specials exist by their exact names.

What it CANNOT check: staleness. Whether a page still agrees with its `sources` needs
the manual half of the lint pass ([[schema]], Lint).

## Read guard — `.claude/hooks/wiki-read-guard.sh`

A `PreToolUse(Read)` hook registered in `.claude/settings.json`. When an agent tries a
direct Read of any `knowledge/*.md`, it answers `permissionDecision: "ask"` — never
"deny" — with a reminder to use the obsidian-cli skill first. The legitimate fallback
(CLI unavailable) still works; it just cannot happen unnoticed. Any parse failure in
the hook falls through to exit 0, so the guard can never block unrelated reads.
