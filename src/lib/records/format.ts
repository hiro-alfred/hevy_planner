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

// formatSets() used to live here, collapsing a session into "100 kg × 8, 8, 7".
// Both surfaces that called it now render one chip per set instead: the string
// form hid exactly the thing a lifter reads a session for — which set was the
// top set, and where the reps fell off.

/**
 * What the numbers in a row of set chips mean: "kg × reps", "reps", or "kg".
 *
 * Read from the sets rather than assumed, because the answer differs per
 * exercise: pull-ups have reps and no load, and a plank has neither. Printing
 * "kg × reps" over a row of bare rep counts is a small lie that makes a
 * bodyweight set look like a missing weight.
 */
export function setsLegend(sets: Array<{ weightKg: number | null; reps: number | null }>): string {
  const weighted = sets.some((set) => set.weightKg !== null && set.weightKg > 0);
  const repped = sets.some((set) => set.reps !== null);
  if (weighted && repped) return "kg × reps";
  if (weighted) return "kg";
  return repped ? "reps" : "";
}
