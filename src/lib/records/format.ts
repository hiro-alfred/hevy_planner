// Display helpers shared by the two records pages.
//
// kg throughout, with no lbs conversion: kg is the only unit the Hevy API
// speaks, and every other screen in this app already shows kg. Converting here
// alone would make a record disagree with the plan it came from.

/** Trims the trailing ".0" so 100 kg reads as "100", not "100.0". */
export function formatKg(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** "2026-08-11" — a stable, sortable date, not a locale-dependent one. */
export function formatDay(iso: string): string {
  return iso.slice(0, 10);
}

/** "today" / "3 d ago" / "5 wk ago" — how recent a session was, at a glance. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} d ago`;
  if (days < 60) return `${Math.floor(days / 7)} wk ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

/**
 * A session's sets as a lifter would write them: "100 kg × 8, 8, 7".
 *
 * Sets at the same weight collapse into one weight and a rep list, because that
 * is how the working sets of a session actually read. A change of weight starts
 * a new group rather than repeating the weight on every set.
 */
export function formatSets(sets: Array<{ weightKg: number | null; reps: number | null }>): string {
  const groups: Array<{ weightKg: number | null; reps: number[] }> = [];

  for (const set of sets) {
    if (set.reps === null) continue;
    const last = groups[groups.length - 1];
    if (last && last.weightKg === set.weightKg) last.reps.push(set.reps);
    else groups.push({ weightKg: set.weightKg, reps: [set.reps] });
  }

  return groups
    .map((group) =>
      group.weightKg === null || group.weightKg === 0
        ? `${group.reps.join(", ")} reps`
        : `${formatKg(group.weightKg)} kg × ${group.reps.join(", ")}`,
    )
    .join(" · ");
}
