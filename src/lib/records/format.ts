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

// ---- dates are CALENDAR days, in the viewer's timezone ---------------------
//
// Both helpers below used to work off the raw ISO string, and both were wrong
// in the same way: a workout is remembered as a DAY ("I trained yesterday
// evening"), not as a number of elapsed hours, and not as a UTC instant.
//
// `formatDay` sliced the first 10 characters, which is the UTC date. Hevy
// returns UTC, so a session logged at 21:00 in a UTC+9 timezone carries
// `...T12:00:00Z` and sliced correctly — but one logged at 07:00 carries the
// PREVIOUS day's date, and the app would print the day before the one the
// trainee lifted on.
//
// `relativeDay` divided the elapsed milliseconds by 24 hours, which counts
// 24-hour blocks rather than days. A session finished at 20:00 yesterday, read
// at 10:00 this morning, is 14 hours old — floor(0.58) = 0 — and printed as
// "today". That is the bug this comment exists for.
//
// The server therefore has to know the trainee's timezone: it renders these,
// and a container defaults to UTC. `TZ` is set on the app service in
// docker-compose.yml. Nothing here reads it directly — `TZ` moves what the Date
// methods below return, which is the point.

/** Local calendar date, midnight, for day-versus-day comparison. */
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days between two instants, in local time. Negative if future. */
function calendarDaysBetween(then: Date, now: Date): number {
  // Rounded, not floored: the two midnights are a whole number of days apart in
  // wall-clock terms, but a DST shift makes the millisecond gap 23 or 25 hours,
  // and flooring 24.96 would report yesterday as today twice a year.
  return Math.round((startOfLocalDay(now) - startOfLocalDay(then)) / 86_400_000);
}

/**
 * "2026-08-11" — the calendar date the session happened, in local time.
 *
 * Still stable and still sortable; it is simply the trainee's date rather than
 * UTC's. Display only — anything that sorts should sort the ISO string itself.
 */
export function formatDay(iso: string): string {
  const local = new Date(iso);
  // Falls back to the raw slice rather than printing "NaN-NaN-NaN".
  if (Number.isNaN(local.getTime())) return iso.slice(0, 10);
  const month = String(local.getMonth() + 1).padStart(2, "0");
  const day = String(local.getDate()).padStart(2, "0");
  return `${local.getFullYear()}-${month}-${day}`;
}

/** "today" / "yesterday" / "3 d ago" / "5 wk ago" — how recent a session was. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  // An unparseable date used to fall through to "NaN mo ago".
  if (Number.isNaN(then.getTime())) return "unknown";

  const days = calendarDaysBetween(then, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} d ago`;
  if (days < 60) return `${Math.floor(days / 7)} wk ago`;
  return `${Math.floor(days / 30)} mo ago`;
}

/**
 * Whole calendar days since `iso`, for callers that bucket rather than print.
 *
 * Exported so the records index's freshness dot agrees with the label beside
 * it. It used to do its own elapsed-hours division, so a lift could show a
 * "today" label under a dot computed from a different number.
 */
export function daysSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  return Number.isNaN(then.getTime()) ? Number.MAX_SAFE_INTEGER : calendarDaysBetween(then, now);
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
