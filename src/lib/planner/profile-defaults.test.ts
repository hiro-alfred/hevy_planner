import { describe, expect, it } from "vitest";
import {
  isEmptyProfile,
  profileCompleteness,
  PROFILE_ITEMS,
  savedProfileSchema,
} from "./profile-defaults";
import { planRequestSchema } from "./schema";

describe("savedProfileSchema", () => {
  it("accepts an entirely empty profile", () => {
    // Every field is optional by construction; the emptiness check is what
    // stops that from becoming a stored row that pre-fills nothing.
    expect(savedProfileSchema.parse({})).toEqual({});
  });

  it("rejects the same values planRequestSchema rejects", () => {
    expect(savedProfileSchema.safeParse({ bodyweightKg: 12 }).success).toBe(false);
    expect(savedProfileSchema.safeParse({ bodyweightKg: 300 }).success).toBe(false);
    expect(savedProfileSchema.safeParse({ split: "bro_split" }).success).toBe(false);
    expect(
      savedProfileSchema.safeParse({ focusMuscleGroups: ["chest", "lats", "biceps"] }).success,
    ).toBe(false);
    expect(savedProfileSchema.safeParse({ currentLifts: { squatKg: 900 } }).success).toBe(false);
  });

  it("rejects an empty equipment list rather than storing 'no filter'", () => {
    // Downstream an empty array means "anything goes", which is the opposite of
    // what unticking every box intends. The parser must send undefined instead.
    expect(savedProfileSchema.safeParse({ equipment: [] }).success).toBe(false);
  });

  it("does not carry the retired fields", () => {
    // `age` and `targetWeightKg` stay in planRequestSchema because stored plans
    // are re-parsed in place, but nothing should ever put them BACK on a form.
    const parsed = savedProfileSchema.parse({ age: 31, targetWeightKg: 80, bodyweightKg: 88 });
    expect(parsed).toEqual({ bodyweightKg: 88 });
  });

  it("produces a value a plan request accepts alongside its required fields", () => {
    const profile = savedProfileSchema.parse({
      goal: "Build muscle",
      sessionsPerWeek: 4,
      sessionMinutes: 60,
      split: "upper_lower",
      experience: "advanced",
      equipment: ["barbell"],
      bodyweightKg: 82,
      phase: "maintain",
      currentLifts: { squatKg: 140, benchKg: 100 },
      focusMuscleGroups: ["chest"],
      injuries: "right shoulder",
      notes: "I run on Tuesdays",
    });
    // The whole point of the shared shape: what the profile stores can be fed
    // straight into a request without translation.
    expect(planRequestSchema.parse(profile)).toMatchObject({ bodyweightKg: 82 });
  });
});

describe("isEmptyProfile", () => {
  it("is true for a profile that answers nothing", () => {
    expect(isEmptyProfile({})).toBe(true);
    expect(isEmptyProfile({ bodyweightKg: undefined })).toBe(true);
  });

  it("is false as soon as one answer exists", () => {
    expect(isEmptyProfile({ phase: "cut" })).toBe(false);
  });
});

describe("profileCompleteness", () => {
  it("reports nothing done for a null profile", () => {
    const result = profileCompleteness(null);
    expect(result.filled).toBe(0);
    expect(result.percent).toBe(0);
    expect(result.items.every((item) => !item.done)).toBe(true);
  });

  it("counts a section done when either of its fields is given", () => {
    // The dial is per-section, not per-field: bodyweight alone is enough to
    // stop nagging about the bodyweight-and-phase row.
    expect(profileCompleteness({ bodyweightKg: 82 }).filled).toBe(1);
    expect(profileCompleteness({ phase: "cut" }).filled).toBe(1);
    expect(profileCompleteness({ bodyweightKg: 82, phase: "cut" }).filled).toBe(1);
  });

  it("does not count a currentLifts object with no lifts in it", () => {
    expect(profileCompleteness({ currentLifts: {} }).filled).toBe(0);
    expect(profileCompleteness({ currentLifts: { benchKg: 100 } }).filled).toBe(1);
  });

  it("reaches 100% and matches the dial's class range", () => {
    const full = profileCompleteness({
      goal: "Build muscle",
      sessionsPerWeek: 4,
      equipment: ["barbell"],
      experience: "advanced",
      currentLifts: { squatKg: 140 },
      bodyweightKg: 82,
      injuries: "none to speak of",
      notes: "I run on Tuesdays",
    });
    expect(full.filled).toBe(full.total);
    expect(full.percent).toBe(100);
    // animations.css defines .ui-dial--f0 through --f8 by hand. A ninth item
    // would silently render with no arc at all.
    expect(PROFILE_ITEMS).toHaveLength(8);
  });
});
