import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans, syncLinks } from "@/lib/db/schema";
import { getLastSessions, getRoutineActivity, type LastSession } from "@/lib/records/last-session";
import { getTemplatesByIds } from "./catalog";
import type { HevyClient } from "./client";
import { unwrapRoutine } from "./routine-format";
import { folderTitles } from "./routines";
import type { HevyRoutineSetPayload } from "./types";

// One routine in the Hevy account, opened up.
//
// Three sources, assembled server-side so the page stays a plain render:
//   - Hevy, for what the routine actually prescribes (live, not the local copy:
//     the routine may have been edited in the app since this plan pushed it);
//   - the local workout cache, for what was lifted last time;
//   - the catalog and sync links, for the muscle group and the owning plan.
//
// Read-only in every direction. Nothing here writes to Hevy or to the cache.

export interface RoutineExerciseDetail {
  index: number;
  templateId: string;
  title: string;
  muscleGroup: string | null;
  equipment: string | null;
  restSeconds: number | null;
  notes: string | null;
  supersetId: number | null;
  sets: Array<Partial<HevyRoutineSetPayload> & { type?: string }>;
  /** The most recent logged session of this exercise, if any. */
  last: LastSession | null;
}

export interface RoutineDetail {
  hevyId: string;
  title: string;
  notes: string;
  folderId: number | null;
  folderTitle: string | null;
  updatedAt: string | null;
  /** The plan that owns this routine, when this app created it. */
  planId: number | null;
  planTitle: string | null;
  day: number | null;
  exercises: RoutineExerciseDetail[];
  lastPerformedAt: string | null;
  sessionCount: number;
}

/**
 * Everything the routine detail page shows.
 *
 * Four database queries regardless of how many exercises the routine holds: the
 * sync link, the catalog rows, the last session per exercise, and the routine's
 * own training history. Returns null when Hevy has no such routine.
 */
export async function getRoutineDetail(
  client: HevyClient,
  routineId: string,
): Promise<RoutineDetail | null> {
  const routine = unwrapRoutine(await client.getRoutine(routineId));
  if (!routine) return null;

  const exercises = routine.exercises ?? [];
  const templateIds = exercises
    .map((exercise) => exercise.exercise_template_id)
    .filter((id): id is string => typeof id === "string");

  // The folder call is skipped entirely for an unfiled routine — it is a paged
  // endpoint, and "My Routines" needs no lookup to name.
  const [link, templates, lastSessions, activity, folders] = await Promise.all([
    db
      .select({ planId: syncLinks.planId, dayIndex: syncLinks.dayIndex, planDoc: plans.plan })
      .from(syncLinks)
      .leftJoin(plans, eq(syncLinks.planId, plans.id))
      .where(eq(syncLinks.hevyRoutineId, routine.id))
      .limit(1),
    getTemplatesByIds(templateIds),
    getLastSessions(templateIds),
    getRoutineActivity([routine.id]),
    routine.folder_id === null || routine.folder_id === undefined
      ? Promise.resolve(new Map<number, string>())
      : folderTitles(client),
  ]);

  const owner = link[0];
  const trained = activity.get(routine.id);

  return {
    hevyId: routine.id,
    title: routine.title ?? "Untitled routine",
    notes: routine.notes ?? "",
    folderId: routine.folder_id ?? null,
    folderTitle: routine.folder_id != null ? (folders.get(routine.folder_id) ?? null) : null,
    updatedAt: routine.updated_at ?? null,
    planId: owner?.planId ?? null,
    planTitle: owner?.planDoc?.title ?? null,
    day: owner ? owner.dayIndex + 1 : null,
    exercises: exercises.map((exercise, position) => {
      const templateId = exercise.exercise_template_id;
      const template = templateId ? templates.get(templateId) : undefined;
      return {
        // Hevy numbers its own exercises, but a missing index must not collapse
        // every row onto 0 — the position in the array is the honest fallback.
        index: exercise.index ?? position,
        templateId: templateId ?? "",
        // The API names the movement on the read side; the catalog is only a
        // fallback for when it does not, and the id is the last resort so a
        // custom exercise still renders as a row.
        title: exercise.title ?? template?.title ?? templateId ?? "Unknown exercise",
        muscleGroup: template?.primaryMuscleGroup ?? null,
        equipment: template?.equipmentCategory ?? null,
        restSeconds: exercise.rest_seconds ?? null,
        notes: exercise.notes ?? null,
        supersetId: exercise.supersets_id ?? null,
        sets: exercise.sets ?? [],
        last: templateId ? (lastSessions.get(templateId) ?? null) : null,
      };
    }),
    lastPerformedAt: trained?.lastPerformedAt ?? null,
    sessionCount: trained?.sessionCount ?? 0,
  };
}
