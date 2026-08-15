---
title: Standing profile — /profile and the answers that persist
aliases: [profile page, standing profile, saved profile, /profile]
tags: [subsystem, planner, form, ui, profile]
type: subsystem
created: 2026-08-15
updated: 2026-08-15
sources:
  [
    src/app/profile/page.tsx,
    src/app/profile/profile-form.tsx,
    src/app/profile/default-fields.tsx,
    src/app/profile/identity-card.tsx,
    src/app/profile/completeness-dial.tsx,
    src/app/profile/actions.ts,
    src/app/profile/profile-request.ts,
    src/app/profile/loading.tsx,
    src/lib/profile-store.ts,
    src/lib/profile-stats.ts,
    src/lib/planner/profile-defaults.ts,
    src/app/plans/new/options.ts,
    src/app/ui-profile.css,
    drizzle/0003_wonderful_wind_dancer.sql,
  ]
---

# Standing profile

`/profile`, built 2026-08-15. The answers that do not change between plans, saved
once and used to pre-fill every later plan request. Distinct from
[[trainee-profile]], which is about what those fields MEAN inside a single
request — this page is about them surviving between requests.

## The problem it solves

`/plans/new` rendered `<PlanForm />` with no `defaults`. Only the edit flow ever
passed any, out of a stored `plans.request`. So every new plan re-typed the
bodyweight, the phase, the four anchor lifts, the injuries, the emphasis and the
notes — and re-picked sessions, session length, split, experience and equipment
from hardcoded constants. A returning user now presses Generate.

**It adds no new questions.** Every field is one the plan form already had, and
the governing rule from [[trainee-profile]] is intact: a field exists only if
something consumes it. The consumer is `PlanForm`'s `defaults` prop, which
already existed for the edit flow — a second caller for a bridge already built.

## Storage: one JSON document, one row

`trainee_profile` (migration 0003) is `id` / `profile json` / `updated_at`, and
`id` is always `PROFILE_ROW_ID = 1`.

- **A JSON document, not a column per field**, for the same reason `plans.request`
  is one: read and written whole, never filtered or grouped by any single field,
  and its shape tracks `planRequestSchema` — which has already gained and retired
  fields twice. A column per answer makes each of those a migration.
- **Not a row in `settings`**, because that table's `value` is `varchar(1024)`
  and notes (500) plus injuries (200) plus a goal sentence plus JSON overhead does
  not reliably fit. A silently truncated profile is the worst failure available.
- **Singleton, not keyed on identity.** Nothing else in this schema carries a user
  id, so a tenant-aware profile would be the only such table — an inconsistency
  that reads as "this one is done" and gets skipped by the sweep that does the
  other ~49 query sites ([[app-authentication]]). It changes with the rest.

`savedProfileSchema` parses on the way OUT as well as in: a stored document can
predate the schema, and an unparsed read would hand the form a `split` value its
`<select>` no longer offers, which renders as a silently blank control. A
document that fails to parse is logged and ignored — never thrown, because a
profile is a convenience and throwing would take `/plans/new` down with it.

## Replace, never merge

`saveProfile` writes the whole document. The form posts every field on every
save, so a field the user CLEARED arrives absent — and a merge would make
blanking a bodyweight impossible, leaving a stale number feeding
[[suggested-loads]] forever. An all-empty submission deletes the row instead of
storing a profile that pre-fills nothing while the page claims one exists.

> [!warning] The hazard this feature introduces
> A profile saved months ago silently supplies a bodyweight and four working
> weights that feed suggested loads, and a plan built on a stale number reaches
> Hevy — which has no DELETE ([[hevy-api]]). `/plans/new` therefore says "Filled
> in from your saved profile" outright, with a link back. The notice is not
> decoration.
>
> Deliberately NOT built: write-back from a plan request into the profile. A
> one-off "I'm 6 kg heavier this cycle" would poison the standing answers. If it
> is ever wanted it must be an explicit unticked checkbox, never automatic.

## The completeness dial

Eight sections, each paired with what giving it MECHANICALLY changes — and the
misses are the ones that show their reason, because a filled field's effect is
already happening while a blank one is an invisible cost. Every `changes` string
names a consumer that exists today; if one stops being true the entry comes off
the list rather than being softened.

The arc is a class (`.ui-dial--f0` … `--f8`), not an inline `stroke-dashoffset` —
inline styles are banned and there is no SVG exemption ([[ui-design-system]]).
`profile-defaults.test.ts` asserts `PROFILE_ITEMS` has exactly 8 entries, because
a ninth would render with no arc at all.

## Training at a glance

`getTrainingStats()` — two grouped queries, never per-exercise, which would be
the banned N+1 at a few hundred rows wide. Deliberately NOT what
[[exercise-records]] shows: that page answers "what is my best bench", this one
answers "how has my training been going", and it is the only readout that talks
back to the profile above it — a 4-day default is worth questioning at 1.1
sessions per week.

The muscle-share query is a **LEFT JOIN** with a null bucket rendered as "Not in
catalog". History can reference a template the catalog no longer has (a deleted
custom exercise), and an inner join would drop those sets so the percentages
quietly failed to add up. See [[workout-history]].

## Profile versus settings

Nothing moved and nothing is duplicated. **Settings** is the app's connection to
the outside world — the Hevy key, the catalog cache ([[key-handling]],
[[catalog-service]]). **Profile** is who the trainee is. Nothing on `/profile`
talks to Hevy; its one Hevy line is a read-only status chip from the existing
`getHevyKeyStatus()` pointing at settings, never a second key form.

The identity card is also the only place the app tells a user that signing out of
a **hevy-key** session revokes nothing — the key is the credential, and this app
cannot rotate someone's Hevy key. That was previously stated only in a code
comment.

## Cut as fiction

Each of these was designed and dropped for having no consumer:

- **Weight unit kg/lbs.** `getWeightUnit`/`setWeightUnit` exist in `settings.ts`
  and have **zero** consumers — `records/format.ts` renders kg everywhere on
  purpose. A toggle that changes nothing on screen is exactly what the governing
  rule bans.
- **A real avatar.** `google.ts` requests `openid email` only, with a comment
  saying `profile` "would pull a name and picture this app has no use for". A
  monogram is drawn from the label instead.
- **Bodyweight trend chart.** There is no bodyweight log; plotting the snapshots
  inside plan requests would be a chart of when someone made plans.
- **Streaks, volume-vs-target, active-session list, delete-my-account.** No
  targets exist, `session.ts` argues against a sessions table, and with no
  `user_id` column "delete my data" is `TRUNCATE`.

Deferred with a named prerequisite: export-my-data and clear-local-history (both
buildable now, neither built this round), sign-out-everywhere (needs a session
epoch), and suggesting anchor lifts from logged history — attractive, but title
matching is a guess and a wrong number reaching a plan reaches Hevy.

## Traps

- **`Array.prototype.forEach(revalidatePath)` does not compile.** forEach passes
  the index as the second argument and `revalidatePath`'s second parameter is a
  `"layout" | "page"` tag. Wrap it in an arrow.
- **`equipment: []` is not "no equipment".** Downstream an empty array means "no
  filter, anything goes". The parser returns `undefined` for an empty tick set so
  the plan form falls back to `DEFAULT_EQUIPMENT`.
- **Widening `PlanForm`'s `defaults` to `Partial<PlanRequest>`** also required
  `derivePhase` to take `Pick<PlanRequest, "bodyweightKg" | "targetWeightKg">`.
  `PROFILE_IS_A_PARTIAL_REQUEST` in `profile-defaults.ts` is a compile-time proof
  that a saved profile still fits the prop, so a later schema narrowing fails at
  the type rather than at the one call site.
- The four fixed-field option lists moved to `plans/new/options.ts` when the
  second form appeared. Two copies would drift invisibly — both forms would still
  compile and quietly disagree about what the user picked.
