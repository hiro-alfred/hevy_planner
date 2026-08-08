---
name: obsidian-cli
description: Query an Obsidian vault through the Obsidian command line interface — read pages, full-text search, and backlinks. Use whenever the task needs information from an Obsidian vault (e.g. the knowledge/ wiki): reading a page, finding pages about a topic, or tracing what links to a page. Prefer this over direct Read/Grep of vault files; fall back to those only when the CLI is unavailable.
---

# obsidian-cli — querying an Obsidian vault

The `obsidian` command talks to the **running Obsidian app**. It is the primary way to
read and search a vault; direct file reads are the fallback.

## Requirements (fail fast if missing)

1. The Obsidian **app must be open** with the target vault loaded.
2. The CLI must be **enabled**: Settings → General → Advanced → Command line interface.

If either is missing, commands error or hang. In that case use the fallback (below)
and **say explicitly that the fallback was used**.

## Argument syntax — key=value, NEVER --flag

This CLI does not use GNU-style flags. `--path` errors with "No active file";
`--version` prints nothing. Neither output means the CLI is missing — it means the
argument syntax was wrong. Always write `key=value` (quote values containing spaces).

## Core verbs

Always pin the vault explicitly — without `vault=…` the CLI targets the most recently
focused vault, which may not be the one you want:

```
obsidian vault="knowledge" read file="hot.md"
obsidian vault="knowledge" search query="routine folders"
obsidian vault="knowledge" backlinks file="schema.md"
```

- `read file=<page>` — print a page's markdown. Paths are vault-relative
  (e.g. `file="concepts/hevy-platform.md"`).
- `search query="…"` — full-text search across the vault; returns matching pages with
  context snippets.
- `backlinks file=<page>` — list pages that link TO the given page; use it to gauge
  the blast radius before editing or renaming a page.

## Recipes

- **Session start**: `obsidian vault="knowledge" read file="hot.md"` before anything
  else; resume from its "Next steps".
- **Topic lookup**: `search query="…"`, then `read` the best hit, then follow its
  wikilinks with further `read` calls.
- **Pre-edit impact check**: `backlinks file="<page>.md"` — every listed page may need
  its links or claims updated.

## Fallback (always works, must be announced)

1. Read `<vault>/index.md` and follow wikilinks by opening the corresponding files.
2. Grep the vault folder for keywords.
3. State in your reply that the CLI was unavailable and the fallback was used.
