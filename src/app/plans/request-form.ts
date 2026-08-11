import { planRequestSchema, type PlanRequest } from "@/lib/planner/schema";

// FormData -> PlanRequest, shared by the two forms that produce one: creating a
// plan (plans/actions.ts) and editing a plan's request into a fork
// (plans/[id]/edit-actions.ts).
//
// A plain module, not part of either "use server" file, because those may only
// export async functions — a helper declared beside the actions would break the
// build the moment it was exported.

// An untouched optional field arrives as "". It must become `undefined`, not 0
// and not null: the schema omits absent fields from the prompt entirely, and a
// bodyweight of 0 would be a lie the model would act on. Text that is present
// but unparseable is passed through as NaN so the schema rejects it, rather
// than being silently dropped.
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
 * @param carried fields the form does not render but must not lose. The edit
 * form is the reason this exists: `excludedExercises` is built by swapping, has
 * no input, and a fork that dropped it would re-suggest every exercise the user
 * has already rejected.
 *
 * The retired fields (`age`, `targetWeightKg`) are deliberately NOT carried. A
 * fork is a fresh request, and the edit form already shows the phase the old
 * target weight implied — so what those numbers meant survives as the answer
 * they were being used to guess, rather than as two inputs nobody sees.
 */
export function parseRequest(
  formData: FormData,
  carried: Partial<PlanRequest> = {},
): PlanRequest {
  const focus = formData.getAll("focusMuscleGroups").map(String);

  return planRequestSchema.parse({
    ...carried,
    goal: String(formData.get("goal") ?? "").trim(),
    sessionMinutes: Number(formData.get("sessionMinutes")),
    sessionsPerWeek: Number(formData.get("sessionsPerWeek")),
    split: String(formData.get("split") ?? "auto"),
    experience: String(formData.get("experience") ?? "beginner"),
    equipment: formData.getAll("equipment").map(String),

    bodyweightKg: optionalNumber(formData.get("bodyweightKg")),
    phase: optionalText(formData.get("phase")),
    goalKind: optionalText(formData.get("goalKind")),
    currentLifts: parseCurrentLifts(formData),
    focusMuscleGroups: focus.length > 0 ? focus : undefined,
    injuries: optionalText(formData.get("injuries")),
    notes: optionalText(formData.get("notes")),
  });
}

export const REQUEST_FORM_ERROR =
  "Check the form: a goal and at least one equipment option are required, and the optional numbers must be realistic (bodyweight 30–250 kg, at most two focus areas).";
