"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { requireIdentity } from "@/lib/auth/guard";
import { describeHevyError } from "@/lib/hevy/errors";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";
import { syncWorkoutHistory } from "@/lib/hevy/workout-sync";

// Server action behind the records page's sync button.
//
// The only way the history cache is ever refreshed: nothing here runs on a page
// render. A first sync walks the entire history ten workouts per request, which
// is slow enough that it must be something the user chose to start.

/**
 * Pulls new workouts into the local cache.
 *
 * @param full re-walk everything instead of asking for changes since the last
 *   sync. The recovery path if the delta feed ever misses an edit — needed
 *   because `events?since=` compares against Hevy's `updated_at`, and nothing
 *   guarantees an edit moves it forward.
 */
export async function syncHistoryAction(full: boolean): Promise<ActionState> {
  await requireIdentity();

  const client = await getHevyClient();
  if (!client) return errorState(NO_KEY_MESSAGE);

  try {
    const result = await syncWorkoutHistory(client, full);
    revalidatePath("/records");

    if (result.mode === "backfill") {
      return successState(
        result.written === 0
          ? "No workouts found in this account yet."
          : `Cached ${result.written} workouts.`,
      );
    }
    if (result.written === 0 && result.deleted === 0) {
      return successState("Already up to date.");
    }
    const parts = [
      result.written > 0 && `${result.written} workout${result.written === 1 ? "" : "s"} updated`,
      result.deleted > 0 && `${result.deleted} removed`,
    ].filter(Boolean);
    return successState(`${parts.join(", ")}.`);
  } catch (error) {
    return errorState(describeHevyError(error, "read", "Could not sync your workout history."));
  }
}
