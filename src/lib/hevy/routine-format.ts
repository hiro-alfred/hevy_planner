import type { HevyRoutine, HevyRoutineSetPayload } from "./types";

// Turning a Hevy routine's sets into the line a lifter would read.
//
// Pure and dependency-free on purpose: this is the only part of the routine
// detail page that has real logic in it, and keeping it out of the server-only
// modules is what makes it testable without a database or an API key.

/** A set as Hevy stores it, with every field optional — this is read data. */
export type RoutineSet = Partial<HevyRoutineSetPayload> & { type?: string };

/**
 * Pulls the routine out of whatever the endpoint wrapped it in.
 *
 * The pinned spec promises `{ routine: Routine }`, and that same spec has
 * already been caught declaring a field name the live API does not send (see
 * types.ts). An array wrapper is the likeliest drift — this API's own routine
 * responses vary that way — so both shapes are accepted rather than trusted.
 * Anything else returns null, which the page turns into a 404 instead of a
 * crash inside `.exercises.map`.
 */
export function unwrapRoutine(
  body: { routine?: HevyRoutine | HevyRoutine[] | null } | null | undefined,
): HevyRoutine | null {
  const routine = body?.routine;
  if (!routine) return null;
  const one = Array.isArray(routine) ? routine[0] : routine;
  return one && typeof one.id === "string" ? one : null;
}

/** Trims a trailing ".0" so 62.5 stays 62.5 but 100.0 reads as 100. */
function kg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * One set as text: "100 kg × 8", "8–12 reps", "45s", "500 m".
 *
 * Every branch is nullable because a Hevy set carries only the metrics its
 * exercise type uses — a plank has duration and nothing else, a prescribed
 * hypertrophy set has a rep RANGE and no weight at all. An empty string means
 * the set prescribes nothing, which is what an untouched "add set" row is.
 */
export function describeSet(set: RoutineSet): string {
  const parts: string[] = [];
  if (set.weight_kg !== null && set.weight_kg !== undefined && set.weight_kg > 0) {
    parts.push(`${kg(set.weight_kg)} kg`);
  }
  if (set.reps !== null && set.reps !== undefined) {
    parts.push(`${set.reps} reps`);
  } else if (set.rep_range && set.rep_range.start !== null && set.rep_range.end !== null) {
    parts.push(`${set.rep_range.start}–${set.rep_range.end} reps`);
  }
  if (set.duration_seconds) parts.push(`${set.duration_seconds}s`);
  if (set.distance_meters) parts.push(`${set.distance_meters} m`);
  return parts.join(" × ");
}

export interface SetSummary {
  /** Working sets — everything except warm-ups. */
  working: number;
  warmups: number;
  /** "3 × 8–12 reps", or "2 × 60 kg × 5 · 3 × 80 kg × 5" when they differ. */
  text: string;
}

/**
 * The whole set list as one line.
 *
 * Identical consecutive sets collapse into a count, because that is how a
 * program is written down: "3 × 8–12", not the same row three times. A change
 * of weight or reps starts a new group rather than flattening the difference
 * away — a top set followed by two back-offs must not read as three equal sets.
 *
 * Warm-ups are counted but never described. They are a fixed ritual, not part
 * of the prescription, and listing them pushes the working sets off the line.
 */
export function summariseSets(sets: RoutineSet[]): SetSummary {
  const working = sets.filter((set) => set.type !== "warmup");
  const groups: Array<{ count: number; text: string }> = [];

  for (const set of working) {
    const text = describeSet(set);
    const last = groups[groups.length - 1];
    if (last && last.text === text) last.count += 1;
    else groups.push({ count: 1, text });
  }

  const text = groups
    .map((group) => (group.text === "" ? `${group.count} sets` : `${group.count} × ${group.text}`))
    .join(" · ");

  return { working: working.length, warmups: sets.length - working.length, text };
}

/**
 * "90s rest" / "2 min rest" / "" when the routine sets none.
 *
 * Minutes above two, because "180s rest" is a number a reader has to convert
 * mid-set. Zero and null are both "no rest set" — Hevy uses them
 * interchangeably — and return an empty string so the caller can omit the field
 * entirely rather than print a rest time of nothing.
 */
export function describeRest(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "";
  if (seconds < 120) return `${seconds}s rest`;
  const minutes = seconds / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min rest`;
}

/**
 * Roughly how long the routine takes, in minutes.
 *
 * Working sets only, one minute of work per set plus the rest that follows it.
 * A deliberate estimate, and labelled as one in the UI: the true answer depends
 * on the lifter, and a fake-precise "47 min" would imply otherwise.
 */
export function estimateMinutes(
  exercises: Array<{ sets: RoutineSet[]; restSeconds: number | null }>,
): number {
  const seconds = exercises.reduce((total, exercise) => {
    const working = exercise.sets.filter((set) => set.type !== "warmup").length;
    return total + working * (60 + Math.max(exercise.restSeconds ?? 90, 0));
  }, 0);
  return Math.round(seconds / 60);
}
