---
title: UI design system — the neon-HUD theme
aliases: [ui, design system, hud theme, styling]
tags: [ui, css, frontend, motion]
type: subsystem
created: 2026-08-08
updated: 2026-08-08
sources:
  [
    src/app/globals.css,
    src/app/hud.css,
    src/app/hud-controls.css,
    src/app/animations.css,
    src/components/hud-backdrop.tsx,
    src/components/pointer-glow.tsx,
    src/components/reveal-observer.tsx,
    src/components/count-up.tsx,
    CLAUDE.md,
  ]
---

# UI design system — the neon-HUD theme

The app's visual layer, replacing the Tailwind starter defaults on 2026-08-08. The
look is a **neon HUD**: near-black ground, cyan and magenta hairlines, corner
brackets, scanlines, an animated node field behind the page. Every screen the user
sees — dashboard, [[key-handling|settings]], plan form, plan preview and
[[hevy-sync|sync]] panel — is built from these primitives.

## Dark only, deliberately

The starter's `prefers-color-scheme` light branch was **removed**, not inverted. The
whole look is emissive — glow, scanlines, thin neon lines only read against a
near-black ground — so a light variant would be a second design to maintain rather
than a palette flip. `:root` sets `color-scheme: dark` so native selects, scrollbars
and the password input render dark without being styled individually.

## File layering

`globals.css` is the only file the app imports. It pulls in the others, defines the
`@theme` tokens (`--color-hud-cyan`, `--color-hud-panel`, …) and the `@layer base`
rules for `body`, the scanline overlay and the focus ring.

| File                | Holds                                                  |
| ------------------- | ------------------------------------------------------ |
| `globals.css`       | imports, `@theme` tokens, base layer                   |
| `hud.css`           | page shell, type scale, `.hud-panel`, `.hud-row`       |
| `hud-controls.css`  | buttons, fields, chips, notices, nav, stat tiles       |
| `animations.css`    | all `@keyframes`, `.reveal`, the reduced-motion switch |

The `hud.css` / `hud-controls.css` split is **not** conceptual — the two are one
stylesheet, cut only because the combined file hit 404 lines against the 300-line
cap in CLAUDE.md.

Component styling lives in CSS classes rather than Tailwind utilities in the JSX
because the look depends on pseudo-elements (corner brackets, glow layers, hover
sweeps) that utilities cannot express, and because the project bans inline styles —
there is nowhere else for them to go. Tailwind utilities still carry layout
(flex, grid, gap).

## Motion architecture

Four client components, each kept as small as possible so pages stay server
components:

- **`hud-backdrop.tsx`** — fixed canvas node field with a magenta scan beam. Fixed
  node count, no per-frame allocation, cancels its rAF loop when the tab is hidden.
  The `body` also carries a CSS grid background, so the page still looks intentional
  if the canvas never mounts.
- **`reveal-observer.tsx`** — mounted **once in the layout**, it queries `.reveal`
  document-wide and adds `.is-visible` on intersection. This is what lets server
  components opt into scroll reveal with a class name alone, pushing no client
  boundary into the page tree. Keyed on `usePathname` because App Router swaps the
  tree without remounting the layout.
- **`pointer-glow.tsx`** — attaches to its own `parentElement`, so a server-rendered
  panel can drop it in as a child. Skips touch and reduced-motion entirely.
- **`count-up.tsx`** — the server renders the real number (correct without JS,
  hydration matches); the reset to zero happens in a **layout** effect so the final
  value never flashes before counting.

Stagger uses fixed `.reveal--d1`…`.reveal--d6` classes rather than a JS-set delay,
because inline styles are banned.

> [!warning] One convention exception
> `pointer-glow.tsx` writes `--glow-x` / `--glow-y` through
> `element.style.setProperty`. No `style` attribute appears in the JSX and the
> gradient itself is in CSS, but this is a runtime inline style — the only place the
> no-inline-CSS rule is bent. Dropping pointer tracking for a static centred glow
> would remove it.

`prefers-reduced-motion: reduce` is handled in **one** block at the bottom of
`animations.css` that zeroes every animation and transition, so no new animation has
to remember to opt out. The canvas checks the same query in JS and paints one static
frame.

## Traps

- **A pseudo-element that slides in must set its `left`.** The button hover sweep
  used `translateX(-120%)` with no `left`, so `::before` took its static position in
  the flex line and the highlight sat permanently visible on every button instead of
  only sweeping. Caught by looking at a screenshot, not by any test.
- **Turbopack caches a failed `@import` resolution.** Writing `globals.css` (which
  `@import`s `hud.css`) *before* creating `hud.css` poisoned the dev cache with
  `Can't resolve './hud.css'`, and it survived a dev-server restart while
  `next build` succeeded from the same source. Clearing `.next` is the fix. This is
  the rare case that genuinely needs it — ordinary style edits hot-reload fine.
- **Buttons stretch in column layouts.** `ActionButton` wraps its button in a
  flex column, which made it full-width inside a panel until `items-start` was
  added.

## Not yet seen

`/plans/[id]` has never been rendered — the database holds zero plans. It compiles,
typechecks and builds, but the plan preview, day panels and sync notices have not
been looked at. See [[hot]] for the current blocker.
