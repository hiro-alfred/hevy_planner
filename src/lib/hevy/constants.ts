// Enum values copied verbatim from the pinned spec (docs/hevy-openapi.json,
// components.schemas.MuscleGroup / EquipmentCategory). The API rejects anything
// outside these sets, and it has no endpoint that lists them — so they are
// hard-coded here and re-checked whenever the spec is re-fetched.

export const MUSCLE_GROUPS = [
  "abdominals",
  "shoulders",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hamstrings",
  "calves",
  "glutes",
  "abductors",
  "adductors",
  "lats",
  "upper_back",
  "traps",
  "lower_back",
  "chest",
  "cardio",
  "neck",
  "full_body",
  "other",
] as const;

export const EQUIPMENT_CATEGORIES = [
  "none",
  "barbell",
  "dumbbell",
  "kettlebell",
  "machine",
  "plate",
  "resistance_band",
  "suspension",
  "other",
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];

// Equipment a trainee is assumed to have when they express no preference: a
// commercial-gym loadout. "none" (bodyweight) is always available.
export const DEFAULT_EQUIPMENT: EquipmentCategory[] = [
  "none",
  "barbell",
  "dumbbell",
  "machine",
  "plate",
];

// Human labels for the UI. Kept beside the enums so a spec change surfaces here
// too; the raw snake_case values are what cross the API boundary.
export const EQUIPMENT_LABELS: Record<EquipmentCategory, string> = {
  none: "Bodyweight",
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  machine: "Machine",
  plate: "Weight plate",
  resistance_band: "Resistance band",
  suspension: "Suspension trainer",
  other: "Other",
};
