#!/usr/bin/env bash
# PreToolUse(Read) guard for the knowledge/ Obsidian wiki.
# The obsidian-cli skill is the PRIMARY path into knowledge/; a direct Read is a
# FALLBACK. This hook turns that prose rule into a visible prompt:
# permissionDecision "ask", never "deny", so the legitimate fallback still works —
# it just cannot happen unnoticed.
# Any parse failure falls through to a silent exit 0 (= no opinion, Read proceeds).

set -u
input=$(cat 2>/dev/null || true)
path=$(printf '%s' "$input" \
  | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$path" ] || exit 0

case "${path,,}" in
  *knowledge[/\\]*.md)
    cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"knowledge/ is the Obsidian LLM-wiki. Use the obsidian-cli skill FIRST: `obsidian read path=<file>`, `obsidian search query=\"...\"`, `obsidian backlinks path=<file>`. Args are key=value, never --flag. Approve this direct Read only if the CLI already failed."}}
JSON
    ;;
esac
exit 0
