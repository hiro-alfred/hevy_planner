import { z } from "zod";
import { MUSCLE_GROUPS } from "@/lib/hevy/constants";

// Internal plan model — deliberately neither the LLM's raw output shape nor the
// Hevy payload shape (see knowledge/decisions/plan-pipeline.md). All weights kg.

export const setTypeSchema = z.enum(["warmup", "normal", "failure", "dropset"]);

export const planSetSchema = z.object({
  type: setTypeSchema,
  repRange: z.object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
  }),
  // Suggested starting load in kg; null = leave for the user to fill in Hevy.
  weightKg: z.number().positive().nullable(),
});

export const planExerciseSchema = z.object({
  // Must resolve against the cached Hevy exercise_templates catalog.
  exerciseTemplateId: z.string(),
  name: z.string(),
  restSeconds: z.number().int().min(0),
  notes: z.string().nullable(),
  sets: z.array(planSetSchema).min(1),
});

export const planDaySchema = z.object({
  title: z.string(),
  exercises: z.array(planExerciseSchema).min(1),
});

export const planSchema = z.object({
  title: z.string(),
  progression: z.string(),
  days: z.array(planDaySchema).min(1),
});

/**
 * The trainee's working weights, used to anchor suggested loads.
 *
 * Asked for as "a comfortable top set of 5", never a 1RM: a form field is not a
 * reason for anyone to go and test a max, and a top-5 is what a coach actually
 * asks for. The four lifts are anchors — accessory loads are extrapolated from
 * them rather than asked for one by one.
 */
export const currentLiftsSchema = z.object({
  squatKg: z.number().positive().max(500).optional(),
  benchKg: z.number().positive().max(500).optional(),
  deadliftKg: z.number().positive().max(500).optional(),
  overheadPressKg: z.number().positive().max(500).optional(),
});

export const planRequestSchema = z.object({
  goal: z.string().min(1),
  sessionMinutes: z.number().int().min(15).max(240),
  sessionsPerWeek: z.number().int().min(1).max(7),
  split: z.enum(["push_pull_legs", "upper_lower", "full_body", "auto"]),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  // Hevy EquipmentCategory values the user has access to. At least one is
  // required: downstream an empty array means "no filter — anything goes",
  // which is the opposite of what someone who unticked every box intends.
  // Bodyweight-only trainees pick "none", which IS a category.
  equipment: z.array(z.string()).min(1),

  // ---- Optional trainee profile ----------------------------------------
  //
  // EVERY field below is optional, for two reasons. Stored requests are read
  // back out of the JSON column without being re-parsed (see lib/plans.ts), so
  // a required field would make the type lie about every plan created before it
  // existed. And the form must keep its "just press generate" path: absent
  // fields are omitted from the prompt entirely rather than sent as "unknown".
  bodyweightKg: z.number().min(30).max(250).optional(),
  targetWeightKg: z.number().min(30).max(250).optional(),
  age: z.number().int().min(13).max(100).optional(),
  currentLifts: currentLiftsSchema.optional(),
  // Capped at two: emphasising everything emphasises nothing, and every focus
  // group widens the candidate query it rides on.
  focusMuscleGroups: z.array(z.enum(MUSCLE_GROUPS)).max(2).optional(),
  // Kept out of `notes` on purpose — a hard constraint the model must route
  // around, not one preference among many in a paragraph.
  injuries: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type SetType = z.infer<typeof setTypeSchema>;
export type PlanSet = z.infer<typeof planSetSchema>;
export type PlanExercise = z.infer<typeof planExerciseSchema>;
export type PlanDay = z.infer<typeof planDaySchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;
export type CurrentLifts = z.infer<typeof currentLiftsSchema>;
