import { z } from "zod";

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

export const planRequestSchema = z.object({
  goal: z.string().min(1),
  sessionMinutes: z.number().int().min(15).max(240),
  sessionsPerWeek: z.number().int().min(1).max(7),
  split: z.enum(["push_pull_legs", "upper_lower", "full_body", "auto"]),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  // Hevy EquipmentCategory values the user has access to.
  equipment: z.array(z.string()),
});

export type SetType = z.infer<typeof setTypeSchema>;
export type PlanSet = z.infer<typeof planSetSchema>;
export type PlanExercise = z.infer<typeof planExerciseSchema>;
export type PlanDay = z.infer<typeof planDaySchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;
