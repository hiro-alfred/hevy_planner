import { z } from "zod";
import { MUSCLE_GROUPS } from "@/lib/hevy/constants";
import { currentLiftsSchema, type PlanRequest } from "./schema";

// The STANDING profile: the answers that do not change between plans, saved
// once and used to pre-fill every later plan request.
//
// The distinction from lib/planner/profile.ts is worth stating, because both
// modules say "profile". That one is about a SINGLE request — what the optional
// intake fields mean and what is derived from them. This one is about the
// answers surviving between requests, and adds no new questions at all: every
// field below already exists on the plan form. See knowledge/systems/trainee-profile.md.
//
// THE GOVERNING RULE STILL HOLDS: a field exists only if something consumes it.
// The consumer here is the plan form's `defaults` prop, which already existed
// for the edit flow — so this is a second caller for a bridge that was already
// built, not a new mechanism.

/**
 * Every field optional, and deliberately a structural subset of PlanRequest so
 * a saved profile can be handed straight to `<PlanForm defaults={…}>`.
 *
 * The bounds are copied from planRequestSchema rather than shared, because the
 * two diverge on exactly one point that matters: here `goal` and the schedule
 * fields may be absent, and there they may not.
 */
export const savedProfileSchema = z.object({
  goal: z.string().max(200).optional(),
  goalKind: z.enum(["strength", "hypertrophy", "endurance"]).optional(),
  sessionsPerWeek: z.number().int().min(1).max(7).optional(),
  sessionMinutes: z.number().int().min(15).max(240).optional(),
  split: z.enum(["push_pull_legs", "upper_lower", "full_body", "auto"]).optional(),
  experience: z.enum(["beginner", "intermediate", "advanced"]).optional(),
  equipment: z.array(z.string()).min(1).optional(),
  bodyweightKg: z.number().min(30).max(250).optional(),
  phase: z.enum(["cut", "maintain", "bulk"]).optional(),
  currentLifts: currentLiftsSchema.optional(),
  focusMuscleGroups: z.array(z.enum(MUSCLE_GROUPS)).max(2).optional(),
  injuries: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

export type SavedProfile = z.infer<typeof savedProfileSchema>;

/**
 * Compile-time proof that a saved profile is assignable to the plan form's
 * `defaults` prop. If planRequestSchema ever narrows a type this file widens —
 * a new split value, say — the build fails here rather than at the one call
 * site in plans/new, which is easy to miss.
 */
export const PROFILE_IS_A_PARTIAL_REQUEST: SavedProfile extends Partial<PlanRequest>
  ? true
  : never = true;

/**
 * A saved profile that answers nothing is not a profile.
 *
 * `savedProfileSchema.parse({})` succeeds — every field is optional — so an
 * empty form submission would otherwise store a row that pre-fills nothing and
 * makes the page claim a profile exists. Callers store null instead.
 */
export function isEmptyProfile(profile: SavedProfile): boolean {
  return Object.values(profile).every((value) => value === undefined);
}

/**
 * A checklist entry: one answer, and what giving it MECHANICALLY changes.
 *
 * The second half is the point. A profile page that lists blank fields is a
 * chore; one that says what each blank costs is a reason to fill it in. Every
 * `changes` string below names a consumer that exists in this codebase today —
 * if one ever stops being true, the entry comes off the list rather than being
 * softened into marketing.
 */
export interface ProfileItem {
  id: string;
  label: string;
  changes: string;
  filled: (profile: SavedProfile) => boolean;
}

/** True when at least one of the four anchor lifts is known. */
function hasAnyLift(profile: SavedProfile): boolean {
  const lifts = profile.currentLifts;
  return lifts !== undefined && Object.values(lifts).some((value) => value !== undefined);
}

export const PROFILE_ITEMS: ProfileItem[] = [
  {
    id: "goal",
    label: "Goal and rep ranges",
    changes: "Sets the rep range and rest outright instead of classifying your goal sentence.",
    filled: (profile) => profile.goal !== undefined || profile.goalKind !== undefined,
  },
  {
    id: "schedule",
    label: "Days and session length",
    changes: "Drives the split and the per-session exercise budget.",
    filled: (profile) =>
      profile.sessionsPerWeek !== undefined || profile.sessionMinutes !== undefined,
  },
  {
    id: "equipment",
    label: "Equipment you can use",
    changes: "Filters every exercise candidate before the plan is built.",
    filled: (profile) => profile.equipment !== undefined,
  },
  {
    id: "experience",
    label: "Experience",
    changes: "Moves the volume the plan starts at.",
    filled: (profile) => profile.experience !== undefined,
  },
  {
    id: "lifts",
    label: "Working weights",
    changes: "Plans arrive in Hevy with suggested starting weights instead of blanks.",
    filled: hasAnyLift,
  },
  {
    id: "bodyweight",
    label: "Bodyweight and phase",
    changes: "Bodyweight-relative loads, and whether to hold load or add it.",
    filled: (profile) => profile.bodyweightKg !== undefined || profile.phase !== undefined,
  },
  {
    id: "injuries",
    label: "Injuries",
    changes: "Provoking patterns are excluded, substituted, and given a caution note.",
    filled: (profile) => profile.injuries !== undefined,
  },
  {
    id: "focus",
    label: "Emphasis and notes",
    changes: "Two to four extra weekly sets, and constraints in your own words.",
    filled: (profile) => profile.focusMuscleGroups !== undefined || profile.notes !== undefined,
  },
];

export interface ProfileCompleteness {
  filled: number;
  total: number;
  /** 0-100, rounded. For the readout beside the dial. */
  percent: number;
  /** Every item, with its state — the page renders the misses as prompts. */
  items: Array<ProfileItem & { done: boolean }>;
}

export function profileCompleteness(profile: SavedProfile | null): ProfileCompleteness {
  const items = PROFILE_ITEMS.map((item) => ({
    ...item,
    done: profile !== null && item.filled(profile),
  }));
  const filled = items.filter((item) => item.done).length;
  return {
    filled,
    total: items.length,
    percent: Math.round((filled / items.length) * 100),
    items,
  };
}
