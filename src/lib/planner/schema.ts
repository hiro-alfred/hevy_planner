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

  // What the trainee is eating for, asked outright.
  //
  // This replaced `targetWeightKg` on 2026-08-11. The target weight was only
  // ever collected to derive exactly this enum, and it did so badly: it needed
  // BOTH weights to say anything, so a trainee who gave one and not the other
  // got silence. Asking the question directly costs one field instead of two
  // and cannot return null for want of an unrelated number.
  phase: z.enum(["cut", "maintain", "bulk"]).optional(),

  // The rep range and rest to program, when the trainee would rather say than
  // have it read out of their goal sentence. Absent means classify the text.
  //
  // Added because the classifier is a guess by construction and the form's own
  // default goal text was being guessed wrong — see prescription.ts.
  goalKind: z.enum(["strength", "hypertrophy", "endurance"]).optional(),

  currentLifts: currentLiftsSchema.optional(),
  // Capped at two: emphasising everything emphasises nothing, and every focus
  // group widens the candidate query it rides on.
  focusMuscleGroups: z.array(z.enum(MUSCLE_GROUPS)).max(2).optional(),
  // Kept out of `notes` on purpose — a hard constraint the model must route
  // around, not one preference among many in a paragraph.
  injuries: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),

  // ---- Retired fields, still parsed --------------------------------------
  //
  // Neither is on the form any more (2026-08-11). They stay in the schema
  // because they are not dead weight but DATA: several actions re-parse a
  // stored request in place — `planRequestSchema.parse({ ...row.request, … })`
  // in the swap and rejection actions — and zod strips what it does not know.
  // Dropping the keys here would quietly delete them from every plan made
  // before today, the first time its owner swapped an exercise.
  //
  // `targetWeightKg` is superseded by `phase`, which `resolvePhase` still
  // derives from it for requests that predate the enum.
  targetWeightKg: z.number().min(30).max(250).optional(),
  // `age` is cut outright: its only consumer was a bare `- Age: 31` prompt
  // line with no instruction attached, so whatever it changed was the model's
  // own stereotype rather than anything this app asked for. The cases that
  // genuinely alter programming — slow recovery, cranky joints — are what
  // `injuries` and `notes` say explicitly, and the prompt has hard rules for
  // those. See knowledge/systems/trainee-profile.md.
  age: z.number().int().min(13).max(100).optional(),

  // Exercise template ids the trainee has swapped away from on this plan.
  //
  // This lives in the REQUEST, not in the plan document, and that placement is
  // the whole point: the request is what regeneratePlanAction re-reads, while
  // savePlan overwrites the plan wholesale. A rejection stored in the plan would
  // be vaporised by the next regenerate — reintroducing precisely the exercise
  // the user rejected, which is the failure this field exists to prevent.
  //
  // Per plan rather than global: promoting these to a standing preference later
  // is easy, and the reverse is not.
  excludedExercises: z.array(z.string()).max(100).optional(),
});

export type SetType = z.infer<typeof setTypeSchema>;
export type PlanSet = z.infer<typeof planSetSchema>;
export type PlanExercise = z.infer<typeof planExerciseSchema>;
export type PlanDay = z.infer<typeof planDaySchema>;
export type Plan = z.infer<typeof planSchema>;
export type PlanRequest = z.infer<typeof planRequestSchema>;
export type CurrentLifts = z.infer<typeof currentLiftsSchema>;
