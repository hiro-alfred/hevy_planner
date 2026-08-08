import type { CatalogRow } from "@/lib/hevy/catalog";
import { planVolume, prescribe, type Prescription, type Volume } from "./prescription";
import type { Plan, PlanDay, PlanExercise, PlanRequest } from "./schema";
import type { TrainingDayTemplate } from "./split";

// Deterministic, offline plan generator.
//
// This is NOT a degraded mode: it is the fallback that keeps the whole product
// working with no LLM provider configured, and the reference the generated plan
// is validated against. Same request in, same plan out — no randomness anywhere.

/** Compounds first: they earn their session time, so they lead each day. */
const EQUIPMENT_RANK: Record<string, number> = {
  barbell: 0,
  machine: 1,
  dumbbell: 2,
  plate: 3,
  none: 4,
  kettlebell: 5,
  resistance_band: 6,
  suspension: 7,
  other: 8,
};

function rank(row: CatalogRow): number {
  return EQUIPMENT_RANK[row.equipmentCategory] ?? 9;
}

export interface DayCandidates {
  template: TrainingDayTemplate;
  candidates: CatalogRow[];
}

function toExercise(row: CatalogRow, prescription: Prescription, volume: Volume): PlanExercise {
  return {
    exerciseTemplateId: row.id,
    name: row.title,
    restSeconds: prescription.restSeconds,
    notes: null,
    // Starting loads are left to the user: the app has no lifting history yet,
    // and a wrong suggested weight is worse than an empty field.
    sets: Array.from({ length: volume.setsPerExercise }, () => ({
      type: "normal" as const,
      repRange: { ...prescription.repRange },
      weightKg: null,
    })),
  };
}

/**
 * Fills one training day by rotating through its muscle groups.
 *
 * Round-robin rather than "best N overall" so a day that trains four groups
 * doesn't spend all its slots on the first one. A group with no unused primary
 * match falls back to an exercise that hits it as a secondary.
 */
function buildDay(
  { template, candidates }: DayCandidates,
  prescription: Prescription,
  volume: Volume,
): PlanDay {
  const pool = [...candidates].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  const used = new Set<string>();
  const exercises: PlanExercise[] = [];

  const take = (predicate: (row: CatalogRow) => boolean): boolean => {
    const row = pool.find((candidate) => !used.has(candidate.id) && predicate(candidate));
    if (!row) return false;
    used.add(row.id);
    exercises.push(toExercise(row, prescription, volume));
    return true;
  };

  while (exercises.length < volume.exerciseCount) {
    const before = exercises.length;
    for (const group of template.muscleGroups) {
      if (exercises.length >= volume.exerciseCount) break;
      if (take((row) => row.primaryMuscleGroup === group)) continue;
      take((row) => row.secondaryMuscleGroups.includes(group));
    }
    // A full pass that added nothing means the pool is exhausted — without this
    // the loop would spin forever on a thin catalog.
    if (exercises.length === before) break;
  }

  return { title: template.title, exercises };
}

const PROGRESSION: Record<Prescription["goalKind"], string> = {
  strength:
    "Add 2.5 kg to the bar whenever you complete every set at the top of the rep range. If you miss the bottom of the range twice in a row, drop 10% and build back up.",
  hypertrophy:
    "Start at a weight you can control for the top of the rep range. Add reps each week until every set hits the top, then add the smallest available increment and start again at the bottom.",
  endurance:
    "Keep the weight steady and add reps or shorten rest each week. Once every set reaches the top of the range at the target rest, add a small increment.",
};

function planTitle(request: PlanRequest, prescription: Prescription): string {
  const focus = prescription.goalKind.charAt(0).toUpperCase() + prescription.goalKind.slice(1);
  return `${request.sessionsPerWeek}-day ${focus} Plan`;
}

/**
 * Builds a complete plan from pre-fetched per-day candidates.
 *
 * Pure by design — the caller does the catalog queries — so the whole selection
 * policy is unit-testable without a database.
 */
export function buildRuleBasedPlan(request: PlanRequest, days: DayCandidates[]): Plan {
  const prescription = prescribe(request);
  const volume = planVolume(request, prescription);

  return {
    title: planTitle(request, prescription),
    progression: PROGRESSION[prescription.goalKind],
    days: days.map((day) => buildDay(day, prescription, volume)),
  };
}
