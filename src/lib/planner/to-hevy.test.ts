import { describe, expect, it } from "vitest";
import { dayToRoutine, routineHash } from "./to-hevy";

// The write path into Hevy: every field the API expects, and a hash that moves
// exactly when the bytes Hevy would receive move.

describe("hevy payload mapping", () => {
  const day = {
    title: "Push",
    exercises: [
      {
        exerciseTemplateId: "abc",
        name: "Bench Press",
        restSeconds: 120,
        notes: null,
        sets: [{ type: "normal" as const, repRange: { start: 5, end: 8 }, weightKg: 60 }],
      },
    ],
  };

  it("maps to the verified write shape", () => {
    const routine = dayToRoutine(day, 42, "Add weight weekly.");
    expect(routine).toEqual({
      title: "Push",
      folder_id: 42,
      notes: "Add weight weekly.",
      exercises: [
        {
          exercise_template_id: "abc",
          superset_id: null,
          rest_seconds: 120,
          notes: null,
          sets: [
            {
              type: "normal",
              weight_kg: 60,
              reps: null,
              rep_range: { start: 5, end: 8 },
              distance_meters: null,
              duration_seconds: null,
              custom_metric: null,
            },
          ],
        },
      ],
    });
  });

  it("hashes payload content, so an unchanged day hashes identically", () => {
    expect(routineHash(dayToRoutine(day, 42, "x"))).toBe(routineHash(dayToRoutine(day, 42, "x")));
  });

  it("changes the hash when anything Hevy would receive changes", () => {
    const base = routineHash(dayToRoutine(day, 42, "x"));
    expect(routineHash(dayToRoutine(day, 42, "different notes"))).not.toBe(base);

    const heavier = structuredClone(day);
    heavier.exercises[0]!.sets[0]!.weightKg = 65;
    expect(routineHash(dayToRoutine(heavier, 42, "x"))).not.toBe(base);
  });
});
