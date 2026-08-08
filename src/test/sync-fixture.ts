import type { HevyClient } from "@/lib/hevy/client";
import { HevyApiError } from "@/lib/hevy/client";
import type { Plan } from "@/lib/planner/schema";
import { createTempDatabase } from "./database";

// Shared setup for the sync test files. Lives here rather than being copied
// into each one so the fixture plan and the stub client can never drift apart.

// Re-exported so the sync tests keep a single import; the implementation is
// shared with every other DB-touching test file (see ./database.ts).
export { createTempDatabase };

/** Truncates plan state and seeds the catalog rows the fixture plan needs. */
export async function resetPlanState(): Promise<number> {
  const { db } = await import("@/lib/db/client");
  const { syncLinks, plans, exerciseTemplates } = await import("@/lib/db/schema");
  const { createPlan } = await import("@/lib/plans");

  await db.delete(syncLinks);
  await db.delete(plans);

  // Sync refuses to push exercises missing from the cached catalog, so the
  // fixture plan's templates have to exist for the happy paths to run.
  await db.delete(exerciseTemplates);
  await db.insert(exerciseTemplates).values(
    ["Push", "Pull", "Legs"].map((title) => ({
      id: `tmpl-${title}`,
      title,
      type: "weight_reps",
      primaryMuscleGroup: "chest",
      secondaryMuscleGroups: [],
      equipmentCategory: "barbell",
      isCustom: false,
      fetchedAt: "2026-08-08T00:00:00.000Z",
    })),
  );

  return createPlan({
    goal: "Build muscle",
    sessionMinutes: 60,
    sessionsPerWeek: 2,
    split: "auto",
    experience: "intermediate",
    equipment: ["barbell"],
  });
}

export function fixturePlan(dayTitles = ["Push", "Pull"]): Plan {
  return {
    title: "Test Plan",
    progression: "Add weight.",
    days: dayTitles.map((title) => ({
      title,
      exercises: [
        {
          exerciseTemplateId: `tmpl-${title}`,
          name: title,
          restSeconds: 90,
          notes: null,
          sets: [{ type: "normal", repRange: { start: 8, end: 12 }, weightKg: null }],
        },
      ],
    })),
  };
}

export interface Recorder {
  client: HevyClient;
  folders: string[];
  creates: string[];
  updates: string[];
}

/** Stub Hevy client. `failOnCreate` makes the Nth create (1-based) throw. */
export function recorder(options: { failOnCreate?: number; createStatus?: number } = {}): Recorder {
  const state = { folders: [] as string[], creates: [] as string[], updates: [] as string[] };
  let folderId = 100;
  let routineId = 0;

  const client = {
    createRoutineFolder: async (title: string) => {
      state.folders.push(title);
      folderId += 1;
      return { routine_folder: { id: folderId, index: 0, title } };
    },
    createRoutine: async (routine: { title: string }) => {
      if (options.failOnCreate && state.creates.length + 1 === options.failOnCreate) {
        throw new HevyApiError(options.createStatus ?? 500, "boom");
      }
      state.creates.push(routine.title);
      routineId += 1;
      return { routine: { id: `routine-${routineId}` } };
    },
    updateRoutine: async (id: string, routine: { title: string }) => {
      state.updates.push(`${id}:${routine.title}`);
      return { routine: { id } };
    },
  } as unknown as HevyClient;

  // The arrays are shared with the stub, so assertions see calls as they happen.
  return { client, folders: state.folders, creates: state.creates, updates: state.updates };
}
