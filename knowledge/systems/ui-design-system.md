---
title: UI design system — the Graphite theme
aliases: [ui, design system, graphite theme, styling, hud theme]
tags: [ui, css, frontend, motion]
type: subsystem
created: 2026-08-08
updated: 2026-08-11
sources:
  [
    src/app/globals.css,
    src/app/ui.css,
    src/app/ui-controls.css,
    src/app/animations.css,
    src/components/reveal-observer.tsx,
    src/components/count-up.tsx,
    src/components/status-chip.tsx,
    CLAUDE.md,
  ]
---

# UI design system — the Graphite theme

The app's visual layer. **Graphite** replaced the neon-HUD theme on 2026-08-09, one
day after that theme landed: dark ground, one lime accent, hairline dividers, and
type doing the work that glow used to. Every screen — dashboard,
[[key-handling|settings]], plan form, plan preview and [[hevy-sync|sync]] panel — is
built from these primitives.

## Why the HUD went

The owner's verdict on the neon-HUD was that the UI/UX was still bad. Rendering it
next to four alternatives made the reasons concrete, and they are worth keeping
because they are the constraints any future theme must also satisfy:

- A ~720px content column stranded in a 1440px viewport.
- Near-everything uppercase and monospaced, which is exactly wrong for the app's
  dominant content: exercise **names**, which are scanned, not read.
- Cyan-on-navy body text below comfortable contrast.
- Decoration (drifting grid, scanlines, node canvas, corner brackets, pointer glow)
  competing with data that is mostly numbers.

Graphite spends contrast on content instead. The accent marks exactly three things —
primary action, active nav item, current day number — and nothing else, or it stops
meaning "here".

## Dark only, still

There is no light branch and no toggle. `:root` sets `color-scheme: dark` so native
selects, scrollbars and the password input render dark without being styled
individually. A light variant would be a second design to maintain rather than a
palette flip.

## File layering

`globals.css` is the only file the app imports. It pulls in the others, defines the
`@theme` tokens (`--color-ui-accent`, `--color-ui-surface`, …) and the `@layer base`
rules for `body`, selection and the focus ring.

| File              | Holds                                                    |
| ----------------- | -------------------------------------------------------- |
| `globals.css`     | imports, `@theme` tokens, base layer                     |
| `ui.css`          | page shell, type scale, `.ui-card`, `.ui-item`, nav, stats |
| `ui-controls.css` | buttons, fields, checks, disclosure, statuses, notices   |
| `animations.css`  | both `@keyframes`, `.reveal`, the reduced-motion switch  |

The `ui.css` / `ui-controls.css` split is **not** conceptual — the two are one
stylesheet, cut only to stay under the 300-line cap in CLAUDE.md.

Component styling lives in CSS classes rather than Tailwind utilities in the JSX
because the same handful of surfaces recur on every page, and because the project
bans inline styles. Tailwind utilities still carry layout (flex, grid, gap).

Text has exactly three weights — `--color-ui-ink`, `--color-ui-dim`,
`--color-ui-faint` — and all three clear 4.5:1 on the background. A fourth, fainter
grey is how the HUD theme's contrast problem started.

## One shell width

Every page uses a bare `.ui-shell` (64rem) with no per-page `max-w-*` override, and
the top nav is `max-w-5xl` — the same 64rem. This is load-bearing: while the plan
page carried `max-w-3xl`, its content was centred in a narrower column and visibly
failed to line up with the brand in the nav above it. Narrow content inside a page
is constrained by an inner wrapper, never by shrinking the shell.

## Motion architecture

Two client components, each kept as small as possible so pages stay server
components:

- **`reveal-observer.tsx`** — mounted **once in the layout**, it queries `.reveal`
  document-wide and adds `.is-visible` on intersection. This is what lets server
  components opt into scroll reveal with a class name alone, pushing no client
  boundary into the page tree. Keyed on `usePathname` because App Router swaps the
  tree without remounting the layout.
- **`count-up.tsx`** — the server renders the real number (correct without JS,
  hydration matches); the reset to zero happens in a **layout** effect so the final
  value never flashes before counting.

Stagger uses fixed `.reveal--d1`…`.reveal--d6` classes rather than a JS-set delay,
because inline styles are banned.

The only repeating animation left is `.ui-blip` on the "changes pending" status dot —
the one state the user is expected to act on. `prefers-reduced-motion: reduce` is
handled in **one** block at the bottom of `animations.css` that zeroes every
animation and transition, so no new animation has to remember to opt out.

> [!note] The no-inline-CSS exception is gone
> `pointer-glow.tsx` used to write `--glow-x` / `--glow-y` via
> `element.style.setProperty`, the one place the rule was bent. It was deleted with
> the HUD theme, along with `hud-backdrop.tsx`. Nothing in the app now sets a style
> property at runtime.

## Traps

- **Turbopack caches a failed `@import` resolution.** Writing `globals.css` before
  creating a file it `@import`s poisons the dev cache with `Can't resolve …`, and it
  survives a dev-server restart while `next build` succeeds from the same source.
  Clearing `.next` is the fix. Ordinary style edits hot-reload fine.
- **Buttons stretch in column layouts.** `ActionButton` wraps its button in a flex
  column, which made it full-width inside a card until `items-start` was added.
- **A hydration mismatch can come from the browser, not the app.** Bitdefender's
  extension writes `bis_skin_checked`, `bis_register` and `__processed_<uuid>__` onto
  elements before React hydrates, and React then reports the whole tree as a
  server/client attribute mismatch. Read the diff before believing it: if every `-`
  line is an injected attribute and no `className`, text or date differs, the markup
  is correct and the fix is disabling the extension on the dev origin.
  `suppressHydrationWarning` is the wrong tool — it covers a single element rather
  than the nested divs, and it would mask real mismatches later.
- **Screenshots catch the reveal animation mid-flight.** Headless Chrome with
  `--virtual-time-budget` froze the page at opacity ~0 with the stat counters still
  at 0. `--force-prefers-reduced-motion` is the fix, and it is also the honest static
  state to review.

## Coverage

All four screens were rendered against seeded data and looked at after the port:
dashboard (all four sync states), `/plans/[id]`, `/plans/new` and `/settings`.
See [[log]] for the design-selection round that produced this theme.
