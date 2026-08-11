import type {
  HevyExerciseTemplate,
  HevyRoutine,
  HevyRoutineFolder,
  HevyRoutinePayload,
  HevyWorkout,
  HevyWorkoutEvent,
} from "./types";

/**
 * Where the Hevy API lives.
 *
 * Overridable ONLY so the read-only screens can be exercised against a local
 * stand-in — this app cannot otherwise render /routines without a real Pro
 * account, and "never verified" is how the routine detail page would ship.
 * Unset in every real deployment, which is why the default is the real host
 * rather than something that must be configured to work.
 */
const BASE_URL = process.env.HEVY_API_BASE_URL?.replace(/\/+$/, "") || "https://api.hevyapp.com";

export class HevyApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Hevy API ${status}: ${message}`);
  }
}

// Thin adapter over the verified spec (docs/hevy-openapi.json). Deliberately
// dumb: no retries/business logic here — that belongs to catalog.ts / sync.ts.
export class HevyClient {
  constructor(private readonly apiKey: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "api-key": this.apiKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new HevyApiError(res.status, body?.error ?? res.statusText);
    }
    return res.json() as Promise<T>;
  }

  // Cheapest authenticated call in the API — used to validate a key.
  getUserInfo() {
    return this.request<{ data: { id: string; name: string; url: string } }>("/v1/user/info");
  }

  // Max pageSize is 100 on this endpoint only; callers page until page_count.
  getExerciseTemplates(page: number) {
    return this.request<{
      page: number;
      page_count: number;
      exercise_templates: HevyExerciseTemplate[];
    }>(`/v1/exercise_templates?page=${page}&pageSize=100`);
  }

  // Reading routines back. pageSize maxes at 10 here — exercise_templates is
  // the ONLY endpoint that allows 100 — so a large account costs several round
  // trips, which is why nothing calls this on a hot path.
  getRoutines(page: number) {
    return this.request<{
      page: number;
      page_count: number;
      routines: HevyRoutine[];
    }>(`/v1/routines?page=${page}&pageSize=10`);
  }

  // One routine in full. The list endpoint returns the same shape, but reaching
  // a routine that sits on page 7 costs seven requests at pageSize 10, so the
  // detail page asks for it by id.
  //
  // The return type admits an ARRAY as well as an object: the pinned spec says
  // `{ routine: Routine }`, and the same spec has already been wrong about a
  // field name (see types.ts). Callers normalise rather than trust it.
  getRoutine(routineId: string) {
    return this.request<{ routine: HevyRoutine | HevyRoutine[] }>(
      `/v1/routines/${encodeURIComponent(routineId)}`,
    );
  }

  // Folder titles, so the routine list can be grouped the way the Hevy app
  // shows it. pageSize maxes at 10 here too.
  getRoutineFolders(page: number) {
    return this.request<{
      page: number;
      page_count: number;
      routine_folders: HevyRoutineFolder[];
    }>(`/v1/routine_folders?page=${page}&pageSize=10`);
  }

  // How many workouts the account holds. Called before a backfill purely so the
  // UI can say "syncing N workouts" instead of stalling silently for minutes.
  getWorkoutCount() {
    return this.request<{ workout_count: number }>("/v1/workouts/count");
  }

  // The training history. pageSize caps at 10 like routines, so a long history
  // is hundreds of round trips — only workout-sync.ts calls this, and only on an
  // explicit user action, never during a page render.
  getWorkouts(page: number) {
    return this.request<{
      page: number;
      page_count: number;
      workouts: HevyWorkout[];
    }>(`/v1/workouts?page=${page}&pageSize=10`);
  }

  // Delta feed, newest event first. `since` is compared against a workout's
  // updated_at, and is the reason a full backfill happens only once.
  getWorkoutEvents(page: number, since: string) {
    return this.request<{
      page: number;
      page_count: number;
      events: HevyWorkoutEvent[];
    }>(`/v1/workouts/events?page=${page}&pageSize=10&since=${encodeURIComponent(since)}`);
  }

  createRoutineFolder(title: string) {
    return this.request<{ routine_folder: HevyRoutineFolder }>(
      "/v1/routine_folders",
      { method: "POST", body: JSON.stringify({ routine_folder: { title } }) },
    );
  }

  // 403 = routine limit exceeded — must surface to the user, never retry.
  createRoutine(routine: HevyRoutinePayload) {
    return this.request<{ routine: HevyRoutine }>("/v1/routines", {
      method: "POST",
      body: JSON.stringify({ routine }),
    });
  }

  // Full replace: the body must carry the complete exercises array.
  updateRoutine(routineId: string, routine: HevyRoutinePayload) {
    return this.request<{ routine: HevyRoutine }>(`/v1/routines/${routineId}`, {
      method: "PUT",
      body: JSON.stringify({ routine }),
    });
  }
}
