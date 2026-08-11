---
title: Exercise records — what counts as a personal record
aliases: [records, personal records, PRs, records page, rep maxes]
tags: [subsystem, records, metrics, ui]
type: subsystem
created: 2026-08-11
updated: 2026-08-11
sources:
  [
    src/lib/records/metrics.ts,
    src/lib/records/format.ts,
    src/app/records/page.tsx,
    "src/app/records/[templateId]/page.tsx",
  ]
---

# Exercise records — what counts as a personal record

The `/records` screens: an index of every exercise ever logged, and a detail page per
exercise. Reads the cache described in [[workout-history]] and nothing else, so the
pages render fine while Hevy is unreachable. The recommendation card on the detail page
belongs to [[progressive-overload]].

## Two rules that run through everything

1. **Warm-ups are not records.** Every query and every reducer filters `set_type =
   'warmup'` out. Not noise-reduction: a warm-up logged with a mistyped weight is
   exactly the row that invents a fake PR, and a 500 kg typo would otherwise headline
   the page.
2. **Nothing is a record unless the reps back it up.** A weight logged with no reps is
   an abandoned set, not a lift, so it never reaches the weight records.

## The metrics

| Metric              | Definition                                        |
| ------------------- | ------------------------------------------------- |
| Estimated 1RM       | Epley, `weight × (1 + reps/30)`, **reps 1–12 only** |
| Heaviest weight     | `max(weight)` over sets of at least one rep       |
| Best set volume     | `max(weight × reps)`                              |
| Most reps           | `max(reps)` — the only record a bodyweight lift has |
| Rep maxes (1–10)    | heaviest weight moved for **at least** n reps     |

**Epley over Brzycki** because Brzycki divides by `(37 − reps)`: it goes vertical at 36
reps and negative beyond, and real Hevy history contains 20+-rep sets. A formula that
returns nonsense on real data is the wrong formula regardless of which fits a heavy
triple marginally better. At 1 rep Epley returns the weight itself, so a genuine single
is never "estimated" into something else.

**The 12-rep cap on the estimate** is what stops a 25-rep back-off set from estimating
past a real heavy triple and reporting a record the lifter has never come close to.
Those sets still count for volume and rep records.

**"5RM" means at least five reps** — a set of 8 at 100 kg proves a 5-rep capability at
100 kg, so it fills every rep-max row up to 5. The narrower reading (exactly 5) would
leave the table full of holes for no gain.

## Query shape

- The index is **one grouped query** over the whole history, not one per exercise —
  the N+1 the project rules ban, at a few hundred rows wide. Sorted by last-performed,
  because someone opening the page is checking what they are training now, not
  admiring a bench PR from three years ago.
- The detail page is **one query** whose rows are reduced seven ways in memory. Seven
  queries would read the same index seven times.
- MariaDB returns DECIMAL-typed expressions as **strings** through mysql2, and
  `weight_kg * (1 + reps/30)` is DECIMAL because `reps` is an integer column. Every
  aggregate is coerced in JS rather than cast in SQL, so the same guard covers any
  driver-shaped surprise.

## UI notes

- kg throughout, no lbs conversion: kg is the only unit [[hevy-api]] speaks and every
  other screen already shows kg — converting here alone would make a record disagree
  with the plan it came from. (`weightUnit` exists in settings and is still unused
  app-wide.)
- Search is a **GET form**, so a query is a bookmarkable URL the back button undoes.
- `.ui-metrics` from [[ui-design-system]] is a fixed three-column row, so the detail
  page picks its three tiles by whether the exercise carries load — a pull-up has no
  1RM and no heaviest weight, and two zero tiles read as missing data rather than as
  the nature of the exercise.
- Verified running against a hand-seeded database on 2026-08-11: both pages
  screenshotted, all recommendation branches rendered, a 500 kg warm-up correctly
  excluded from the bench records, and an unknown id 404s.
