import type {
  HevyExerciseTemplate,
  HevyRoutine,
  HevyRoutineFolder,
  HevyRoutinePayload,
} from "./types";

const BASE_URL = "https://api.hevyapp.com";

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
