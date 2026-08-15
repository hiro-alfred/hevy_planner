---
title: UI design system — the Graphite theme
aliases: [ui, design system, graphite theme, styling, hud theme]
tags: [ui, css, frontend, motion]
type: subsystem
created: 2026-08-08
updated: 2026-08-15
sources:
  [
    src/app/globals.css,
    src/app/ui.css,
    src/app/ui-controls.css,
    src/app/ui-login.css,
    src/app/ui-profile.css,
    src/app/animations.css,
    src/components/button-styles.ts,
    src/components/action-message.tsx,
    src/app/routines/loading.tsx,
    src/app/login/shell.tsx,
    src/app/login/art.tsx,
    src/components/site-header.tsx,
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
| `ui-login.css`    | the sign-in screen: split frame, artwork paints, pill CTA |
| `ui-profile.css`  | `/profile`: identity strip, completeness dial, skeletons  |
| `animations.css`  | every `@keyframes`, `.reveal`, the reduced-motion switch  |

The `ui.css` / `ui-controls.css` split is **not** conceptual — the two are one
stylesheet, cut only to stay under the 300-line cap in CLAUDE.md.

Component styling lives in CSS classes rather than Tailwind utilities in the JSX
because the same handful of surfaces recur on every page, and because the project
bans inline styles. Tailwind utilities still carry layout (flex, grid, gap).

Text has exactly three weights — `--color-ui-ink`, `--color-ui-dim`,
`--color-ui-faint` — and all three clear 4.5:1 on the background. A fourth, fainter
grey is how the HUD theme's contrast problem started.

## The sign-in screen — the one exception to the shell

`/login` ([[app-authentication]]) is the only page that does **not** use `.ui-shell`.
It is a full-viewport split frame: artwork half on the left (brand mark, "Nice to see
you again", WELCOME BACK, accent rule, the owner-only blurb), gate half on the right
(heading, lede, one wide pill CTA, fine print). Redesigned on 2026-08-14 from a stock
blue login mockup the owner supplied — **the composition was borrowed, none of the
colour was**.

- `login/shell.tsx` is the frame, and *every* branch renders through it: Google
  button, Hevy-key form, and the "not configured" dead end. A misconfigured server
  still looks like the product rather than a bare error card.
- `login/art.tsx` is the illustration — a portrait viewBox sliced to the panel, so it
  survives going from a tall column to a short band above the form.
- `SiteHeader` returns `null` on `/login`: the split wants the whole viewport, and
  every link in that nav points somewhere a logged-out visitor cannot go.

Two rules came out of it.

**SVG paint is CSS, not attributes.** Every fill, stroke, opacity and gradient stop in
the artwork is a class in `ui-login.css`. The no-inline-CSS rule has no SVG exemption,
and the payoff is that the whole illustration re-tints with `--color-ui-accent`
instead of pinning a hex the palette will drift away from.

**At this palette, a wave is a line, not a fill.** The first pass tinted the canvas
with the accent and stacked wave fills up to 0.85 opacity; it rendered as an olive
block — exactly the failure the Graphite palette was chosen against. The fix was
dropping the fills to near-invisible (0.14 → 0.02 gradient stops) and stroking a crest
line along each curve. Only a screenshot of the running app showed it.

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

`prefers-reduced-motion: reduce` is handled in **one** block at the bottom of
`animations.css` that zeroes every animation and transition, so no new animation has
to remember to opt out.

### The 2026-08-15 additions

Four effects landed with [[standing-profile]], each answering a state the UI had no
way to show. None moves in the accent colour, and none is ambient:

- **`.ui-skeleton` + route `loading.tsx`** (`/routines`, `/profile`). The real gap was
  never a missing animation — it was a missing loading state. Every route is
  `force-dynamic`, so a prefetch delivers only the static shell and a click paints
  **nothing** until the server finishes; on `/routines` that is several live Hevy
  round trips. Greys only, reusing `.ui-shell` / `.ui-hero` geometry so content lands
  where the placeholder stood rather than jumping.
- **`.ui-btn--working`** — a sweeping 2px underline while a server action is in
  flight, plus `opacity: 0.75` instead of the disabled `0.45`. This fixes a real bug
  in the state model: a BUSY button looked identical to an UNAVAILABLE one, on
  actions that run for minutes (first history sync, catalog refresh, LLM generation).
  Indeterminate on purpose — none of those actions reports progress, so a percentage
  would be an invention.
- **`.ui-notice--result`** — the outcome of a press, arriving below the control where
  the eye is not. A modifier rather than a rule on `.ui-notice`, because that base
  class also carries a dozen static page notices that already animate in with their
  card's `.reveal`.
- **`.ui-dial`** — the profile completeness arc, transitioned with **no JavaScript at
  all**: the card already carries `.reveal`, `RevealObserver` adds `.is-visible`, and
  the stylesheet transitions `stroke-dashoffset` off that one class change.

`.ui-blip` on the "changes pending" status dot remains the only *repeating* animation
tied to a status, and keeps its exclusive meaning: the one state the user must act on.
The button sweep is admissible beside it only because it is bounded by a request.

> [!note] The rule for adding motion here
> Never encode an animation's hidden or empty state in a plain property outside the
> keyframe. `.reveal` does exactly that (`opacity: 0`) and is the sole reason the
> reduced-motion block needs a second clause. The dial shows why it matters: its
> resting value is the truth and the EMPTY state is the opt-in, behind
> `@media (prefers-reduced-motion: no-preference)`. The other way round, a
> reduced-motion reader would see 0% for a profile that is 75% answered — not a
> frozen animation, a wrong number.

Rejected this round, and worth keeping rejected: page-transition choreography, a
raised `.reveal` stagger cap, anything moving inside the trend chart's frame, toasts,
hover geometry on `.ui-item`, odometers on tabular readouts, a determinate progress
bar for sync (there is no progress channel), and a full-page spinner instead of a
skeleton.

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
- **Headless Chrome on Windows will not render a viewport narrower than ~500px.**
  `--window-size=414,896` lays the page out at 500 and then CROPS the image to 414,
  which looks exactly like a responsive layout overflowing horizontally — the frame
  runs off the right edge and text is cut mid-word. `--headless=old` behaves the same.
  Re-shoot at 500 before believing it: even margins there mean the layout is fine.
- **Screenshots catch the reveal animation mid-flight.** Headless Chrome with
  `--virtual-time-budget` froze the page at opacity ~0 with the stat counters still
  at 0. `--force-prefers-reduced-motion` is the fix, and it is also the honest static
  state to review.

## Coverage

All four screens were rendered against seeded data and looked at after the port:
dashboard (all four sync states), `/plans/[id]`, `/plans/new` and `/settings`.
See [[log]] for the design-selection round that produced this theme.
