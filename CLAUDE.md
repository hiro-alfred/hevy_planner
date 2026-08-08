# hevy_planner

Workout-plan builder targeting the Hevy training app. The repo is greenfield — the
knowledge wiki below is the current source of orientation.

## Knowledge wiki — knowledge/ (Obsidian vault) + session continuity
An LLM-wiki (Karpathy pattern): a synthesis layer over CLAUDE.md + docs, opened as an
Obsidian vault. STRICT — reach for the **obsidian-cli skill** BEFORE the Read/Grep tools; a
direct knowledge/ read is a FALLBACK, allowed only after the CLI fails. Verbs verbatim:
`obsidian read path=hot.md` · `obsidian search query="…"` · `obsidian backlinks path=…`.
Args are `key=value`, NEVER `--flag` (`--path` errors "No active file", `--version` prints
nothing — neither means it is missing).
- EVERY session start: run `obsidian read path=hot.md` (knowledge/hot.md) BEFORE any other
  tool call, whatever the user asked; resume from its Next steps. Update it BEFORE
  long/risky work so an abandoned session stays recoverable.
- WRAP-UP ("wrap up" or any equivalent): overwrite hot.md with active task / state reached /
  open questions / next steps; file finished knowledge into pages, update index.md, append
  to log.md.
- Author per the **obsidian-markdown skill** + knowledge/schema.md; no orphans (enforced by
  tests/test_knowledge_wiki.py). Docs and code stay the source of truth — a conflicting
  wiki page is stale; fix the wiki and log it.
