---
title: Knowledge wiki subsystem
aliases: [knowledge vault, wiki subsystem]
tags: [subsystem, meta, tooling]
type: subsystem
created: 2026-08-08
updated: 2026-08-11
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
  Both documented argument forms have now actually been run here: CLAUDE.md's
  `read path=hot.md` and the skill's `vault="knowledge" read file="hot.md"`
  (verified 2026-08-11).
- **obsidian-markdown skill** (`.claude/skills/obsidian-markdown/`) — authoring
  conventions: frontmatter, wikilinks, callouts, embeds.
- **Read guard + lint test** — enforcement, described in [[wiki-enforcement]].
- **CLAUDE.md block** — binds agents to the protocol: read [[hot]] first every
  session, CLI before direct reads, overwrite hot at wrap-up.

> [!warning] The first `obsidian` command of a session can hang for the whole session
> With no CLI-listening Obsidian instance already running, the first invocation
> *becomes* the host process: it loads `obsidian.asar` and blocks forever, while every
> later `obsidian` command is served BY it (they show up in its log as
> `Received command line [...]`). So call one hangs and calls two onward work.
> Background the first call and carry on. A hang is neither a syntax error nor a
> missing CLI.

## Manual setup (one-time, human-only)

1. Open `knowledge/` as a vault in Obsidian (this folder, not the repo root).
2. Enable the CLI: Settings → General → Advanced → Command line interface.

Until both are done, only the grep/Read fallback path works ([[schema]], Query).
