import { savedProfileSchema, type SavedProfile } from "@/lib/planner/profile-defaults";

// FormData -> SavedProfile, for the profile page's one form.
//
// A plain module, not part of actions.ts, because a "use server" file may only
// export async functions — the same reason plans/request-form.ts exists beside
// plans/actions.ts. The two parsers deliberately stay separate: this one treats
// EVERY field as optional, and sharing a parser would mean one of them lying
// about its required fields.

/**
 * An untouched field arrives as "" and must become `undefined`, never 0 and
 * never null. Absent is what the plan form reads as "no default", while a
 * bodyweight of zero would be a number the user never typed feeding suggested
 * loads. Text that is present but unparseable passes through as NaN so the
 * schema rejects it rather than silently dropping it.
 */
function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : Number(text);
}

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const text = String(value ?? "").trim();
  return text === "" ? undefined : text;
}

/** Undefined unless at least one anchor lift was given. */
function parseCurrentLifts(formData: FormData) {
  const lifts = {
    squatKg: optionalNumber(formData.get("squatKg")),
    benchKg: optionalNumber(formData.get("benchKg")),
    deadliftKg: optionalNumber(formData.get("deadliftKg")),
    overheadPressKg: optionalNumber(formData.get("overheadPressKg")),
  };
  return Object.values(lifts).some((value) => value !== undefined) ? lifts : undefined;
}

/**
 * Undefined when nothing is ticked — NOT an empty array.
 *
 * The distinction is load-bearing downstream: `equipment: []` reaching a plan
 * request means "no filter, anything goes", which is the opposite of what
 * someone who unticked every box intends. Absent means "no saved default", and
 * the plan form falls back to DEFAULT_EQUIPMENT as it always did.
 */
function parseList(formData: FormData, name: string): string[] | undefined {
  const values = formData.getAll(name).map(String);
  return values.length > 0 ? values : undefined;
}

export function parseSavedProfile(formData: FormData): SavedProfile {
  return savedProfileSchema.parse({
    goal: optionalText(formData.get("goal")),
    goalKind: optionalText(formData.get("goalKind")),
    sessionsPerWeek: optionalNumber(formData.get("sessionsPerWeek")),
    sessionMinutes: optionalNumber(formData.get("sessionMinutes")),
    split: optionalText(formData.get("split")),
    experience: optionalText(formData.get("experience")),
    equipment: parseList(formData, "equipment"),

    bodyweightKg: optionalNumber(formData.get("bodyweightKg")),
    phase: optionalText(formData.get("phase")),
    currentLifts: parseCurrentLifts(formData),
    focusMuscleGroups: parseList(formData, "focusMuscleGroups"),
    injuries: optionalText(formData.get("injuries")),
    notes: optionalText(formData.get("notes")),
  });
}

export const PROFILE_FORM_ERROR =
  "Check the form: bodyweight must be 30–250 kg, each lift under 500 kg, and at most two emphasis areas.";
