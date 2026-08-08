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
  to log.md. Then git commit the session's changes (and push).
- Author per the **obsidian-markdown skill** + knowledge/schema.md; no orphans (enforced by
  tests/test_knowledge_wiki.py). Docs and code stay the source of truth — a conflicting
  wiki page is stale; fix the wiki and log it.

## Code standards
- No file should surpass 300 lines of code.
- No N+1 query problems.
- No inline JS or CSS.

## Permissions
- Git is fully allowed without asking: commit, push, merge, branch, and other git
  operations may be performed autonomously when they serve the task.
- STRICT: NEVER read the `.env` file — not with Read/Grep, nor indirectly via shell
  commands (`cat`, `type`, `Get-Content`, echoing vars, etc.). Its values must never
  enter the conversation. `.env.example` is the only place env vars are documented.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
