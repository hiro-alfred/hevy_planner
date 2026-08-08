---
title: Knowledge wiki subsystem
aliases: [knowledge vault, wiki subsystem]
tags: [subsystem, meta, tooling]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources: [knowledge/, CLAUDE.md, .claude/skills/obsidian-cli/SKILL.md, .claude/skills/obsidian-markdown/SKILL.md]
---

# Knowledge wiki subsystem

The `knowledge/` folder is an Obsidian vault implementing the [[llm-wiki-pattern]] for
this repo. This page maps its moving parts; the rules themselves live in [[schema]].

## Layout

- Vault root: five special pages only — [[index]] (hub), [[schema]] (rules), [[hot]]
  (working memory), [[log]] (journal), [[log-archive]] (rotated journal).
- Category folders: `overview/`, `concepts/`, `systems/`, `decisions/` — every other
  page lives in exactly one of them.
- `knowledge/.obsidian/` is gitignored: Obsidian writes per-user UI state there the
  moment the vault is opened, and that must never be committed.

## Toolchain

- **obsidian-cli skill** (`.claude/skills/obsidian-cli/`) — the PRIMARY query path:
  `obsidian vault="knowledge" read file="…"` / `search query="…"` /
  `backlinks file="…"`. Args are `key=value`, never `--flag`. Requires the Obsidian
  app open with the CLI enabled.
- **obsidian-markdown skill** (`.claude/skills/obsidian-markdown/`) — authoring
  conventions: frontmatter, wikilinks, callouts, embeds.
- **Read guard + lint test** — enforcement, described in [[wiki-enforcement]].
- **CLAUDE.md block** — binds agents to the protocol: read [[hot]] first every
  session, CLI before direct reads, overwrite hot at wrap-up.

## Manual setup (one-time, human-only)

1. Open `knowledge/` as a vault in Obsidian (this folder, not the repo root).
2. Enable the CLI: Settings → General → Advanced → Command line interface.

Until both are done, only the grep/Read fallback path works ([[schema]], Query).
