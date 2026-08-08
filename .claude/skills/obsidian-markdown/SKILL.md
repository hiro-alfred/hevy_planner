---
name: obsidian-markdown
description: Author and edit pages in an Obsidian vault correctly — YAML frontmatter, wikilinks, embeds, callouts, tags, and aliases. Use whenever creating or modifying .md files inside an Obsidian vault (e.g. the knowledge/ wiki) so pages stay valid nodes in the vault graph rather than plain markdown files.
---

# obsidian-markdown — authoring vault pages

Obsidian markdown is CommonMark plus vault-specific constructs. Pages that ignore them
still render, but fall out of the graph: no backlinks, no alias resolution, invisible
to structured queries. Follow these rules for every page you create or edit.

## Frontmatter (YAML, first thing in the file)

```yaml
---
title: Human-readable title
aliases: [alternate name, native-language term]
tags: [topic, subtopic]
type: hub | meta | concept | rule | subsystem | design
created: 2026-08-08
updated: 2026-08-08
sources: [path/to/repo/file.py, docs/spec.md]
---
```

- Opens with `---` on line 1 and closes with `---`; nothing above it, not even a blank
  line.
- `aliases` make `[[alias]]` resolve to this page — put alternate and native-language
  names here, never in the filename.
- `sources` are plain strings (repo paths live outside the vault — see Wikilinks).
- Bump `updated` on every substantive edit; leave `created` alone.

## Wikilinks

- `[[page-name]]` — link by filename (no folder, no `.md`). Obsidian resolves by name
  vault-wide, which is why filenames must be unique across the vault.
- `[[page-name|shown text]]` — custom display text after `|`.
- `[[page-name#Heading]]` — link to a section.
- `![[page-name]]` — embed (transclude) a page or image rather than linking it.
- Wikilinks are for **vault pages only**. Files outside the vault (repo code, docs)
  cannot resolve — cite them as plain text, normally in frontmatter `sources`.
- Every page needs at least one outgoing wikilink, or it is a dead end in the graph.

## Callouts

```markdown
> [!note] Optional title
> Body of the callout.
```

Useful types: `note`, `warning`, `tip`, `question`, `quote`. Use sparingly — one
callout for a genuine caveat beats decorating every paragraph.

## Structural conventions

- Filename: kebab-case, one concept per page; the H1 restates the title humanly.
- Headings start at `#` (one per page) then `##`; never skip levels.
- Tags: prefer frontmatter `tags:` over inline `#tag` — inline tags scatter.
- Keep pages under the vault's line cap (300 here); split by concept, not by size, and
  link the parts.
- Before renaming/deleting a page, check its backlinks (obsidian-cli skill) and update
  every referrer in the same pass — Obsidian auto-updates links only when the rename
  happens inside the app.
