"""Lint contract for the knowledge/ LLM-wiki (Obsidian vault).

The vault is a synthesis layer over the repo docs (see knowledge/schema.md). Its
value depends on the graph staying connected and honest: a page that nothing links to
is invisible in Obsidian's graph and to wikilink-following agents, and a broken
wikilink silently dead-ends a query. These tests are the executable half of that
contract — the "lint" operation of the LLM-wiki concept.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
VAULT = ROOT / "knowledge"
INDEX = "index"

ROOT_SPECIALS = {"index", "log", "log-archive", "schema", "hot"}
CATEGORIES = {"overview", "concepts", "systems", "decisions"}

# [[page]], [[page|display]], [[page#heading]], and embeds ![[page]] all resolve to
# the bare page name before | or #.
WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]")

REQUIRED_FRONTMATTER_KEYS = ("title", "aliases", "tags", "type", "created", "updated", "sources")


def _files() -> list[Path]:
    return sorted(
        p for p in VAULT.rglob("*.md")
        if not any(part.startswith(".") for part in p.relative_to(VAULT).parts)
    )


def _pages() -> dict[str, str]:
    return {p.stem: p.read_text(encoding="utf-8") for p in _files()}


def _links(text: str) -> set[str]:
    return {m.strip() for m in WIKILINK_RE.findall(text)}


def test_vault_exists_and_has_an_index():
    assert (VAULT / f"{INDEX}.md").is_file()


def test_page_names_are_unique_vault_wide():
    seen, dupes = {}, []
    for p in _files():
        if p.stem in seen:
            dupes.append(f"{p.stem}: {seen[p.stem].relative_to(VAULT)} vs {p.relative_to(VAULT)}")
        seen[p.stem] = p
    assert not dupes, f"duplicate page names break wikilink resolution: {dupes}"


def test_every_page_sits_in_a_known_category():
    misfiled = []
    for p in _files():
        rel = p.relative_to(VAULT)
        if len(rel.parts) == 1:
            if p.stem not in ROOT_SPECIALS:
                misfiled.append(f"{rel} (root is only for {sorted(ROOT_SPECIALS)})")
        elif rel.parts[0] not in CATEGORIES or len(rel.parts) != 2:
            misfiled.append(f"{rel} (categories are {sorted(CATEGORIES)}, one level deep)")
    assert not misfiled, f"pages outside the category layout: {misfiled}"


def test_every_page_has_required_frontmatter():
    bad = []
    for name, text in _pages().items():
        if not text.startswith("---\n"):
            bad.append(f"{name}: no frontmatter block")
            continue
        end = text.find("\n---", 4)
        block = text[4:end] if end != -1 else ""
        missing = [k for k in REQUIRED_FRONTMATTER_KEYS if not re.search(rf"^{k}:", block, re.M)]
        if end == -1:
            bad.append(f"{name}: unterminated frontmatter")
        elif missing:
            bad.append(f"{name}: missing {missing}")
    assert not bad, f"frontmatter violations: {bad}"


def test_every_wikilink_resolves():
    pages = _pages()
    broken = [
        f"{name} → [[{target}]]"
        for name, text in pages.items()
        for target in sorted(_links(text))
        if target not in pages
    ]
    assert not broken, f"wikilinks to missing pages: {broken}"


def test_no_orphans_every_page_reachable_from_index():
    pages = _pages()
    reachable, frontier = {INDEX}, [INDEX]
    while frontier:
        for target in _links(pages[frontier.pop()]):
            if target in pages and target not in reachable:
                reachable.add(target)
                frontier.append(target)
    orphans = sorted(set(pages) - reachable)
    assert not orphans, f"pages unreachable from index.md (orphans): {orphans}"


def test_every_page_is_cataloged_in_the_index():
    pages = _pages()
    index_links = _links(pages[INDEX])
    missing = sorted(n for n in pages if n != INDEX and n not in index_links)
    assert not missing, f"pages missing from the index catalog: {missing}"


def test_every_page_links_out():
    dead_ends = sorted(n for n, t in _pages().items() if not _links(t))
    assert not dead_ends, f"pages with zero outgoing wikilinks: {dead_ends}"


def test_wiki_pages_respect_the_line_cap():
    oversized = [
        f"{n}.md ({len(t.splitlines())} lines)"
        for n, t in _pages().items() if len(t.splitlines()) > 300
    ]
    assert not oversized, f"over the 300-line cap: {oversized}"


@pytest.mark.parametrize("page", sorted(ROOT_SPECIALS))
def test_root_specials_survive(page):
    assert (VAULT / f"{page}.md").is_file(), (
        f"knowledge/{page}.md is cited by name from CLAUDE.md / schema.md — renaming or "
        f"moving it breaks the query protocol"
    )
