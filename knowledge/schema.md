---
title: Vault schema — how this wiki works
aliases: [schema, vault rules, wiki conventions]
tags: [meta, conventions]
type: meta
created: 2026-08-08
updated: 2026-08-08
sources: [CLAUDE.md, tests/test_knowledge_wiki.py, .claude/hooks/wiki-read-guard.sh]
---

# Vault schema

This vault (`knowledge/`) is an **LLM-wiki** ([[llm-wiki-pattern]]): a persistent
synthesis layer over the hevy_planner repo — a workout-plan builder targeting the Hevy
training app. The LLM maintains it across sessions as a disciplined wiki maintainer;
session continuity lives in [[hot]]. The hub is [[index]]; the journal is [[log]].

## Categories

Every non-special page lives in exactly one of these folders:

| Category    | What goes there                                                          |
| ----------- | ------------------------------------------------------------------------ |
| `overview/` | Orientation pages: what the project is, repo layout, current status      |
| `concepts/` | Domain and design concepts: Hevy platform, training/programming ideas    |
| `systems/`  | Concrete subsystems of this repo: modules, pipelines, tooling            |
| `decisions/`| Decisions with rationale: architecture choices, trade-offs, bootstraps   |

## Page conventions

- **One page = one concept.** Kebab-case filename, filed in exactly one category folder.
  Filenames are unique vault-wide — wikilinks resolve by name alone, never by folder.
- **Vault root holds ONLY the five specials**: [[index]], [[schema]], [[hot]], [[log]],
  [[log-archive]].
- **Max 300 lines per page** — including log.md, which rotates into [[log-archive]].
- **English prose only.** Native-language domain terms belong in frontmatter `aliases`
  (add a `glossary` page if bilingual vocabulary ever accumulates).
- **Frontmatter required** on every page:

  ```yaml
  ---
  title: Human-readable title
  aliases: [alternate names]
  tags: [topic tags]
  type: hub | meta | concept | rule | subsystem | design
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  sources: [repo paths this page synthesizes]
  ---
  ```

- **No orphans**: every page is listed in [[index]], reachable from it via wikilinks,
  and carries at least one outgoing wikilink.
- **Wikilinks are for vault pages only.** Repo files are cited as plain text in
  `sources` — they live outside the vault, so a wikilink cannot resolve.
- **Source-of-truth rule**: the wiki is a synthesis layer. Code and docs always win on
  conflict — a disagreement means the wiki page is stale; fix the wiki, log it in [[log]].

All of the mechanical rules above are enforced by `tests/test_knowledge_wiki.py`
(see [[wiki-enforcement]]).

## Operations

### Session start
Read [[hot]] FIRST (via the obsidian-cli skill: `obsidian vault="knowledge" read
file="hot.md"`), before any other tool call, and resume from its **Next steps**.
Update hot.md BEFORE long/risky work so an abandoned session stays recoverable.

### Wrap-up
When the user says "wrap up" or an equivalent:
1. **OVERWRITE** [[hot]] with: active task / state reached / open questions / next
   steps. History goes to [[log]], never hot.
2. File finished knowledge into category pages.
3. Update [[index]], append one line to [[log]].

### Ingest
When new knowledge arrives (a doc change, a decision, a discovered bug):
1. Read the source.
2. Create/update pages — one source may touch many.
3. Update [[index]] and bump `updated` dates on touched pages.
4. Append one line to [[log]].
5. Run `python -m pytest tests/test_knowledge_wiki.py`.

### Query
Primary path is the **obsidian-cli skill**:

```
obsidian vault="knowledge" search query="…"
obsidian vault="knowledge" read file="…"
obsidian vault="knowledge" backlinks file="…"
```

Always pin `vault="knowledge"` — the CLI otherwise targets the most recently focused
vault. Requires the Obsidian app to be OPEN with the CLI enabled (Settings → General →
Advanced → Command line interface). Fallback (always works): read [[index]], follow
wikilinks, grep `knowledge/` — and state explicitly that the fallback was used.

### Lint
Periodically run the wiki test, then re-read pages against their `sources` for
contradictions and stale claims. File findings in [[log]]; fix in the same pass.
