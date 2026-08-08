import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Plan } from "@/lib/planner/schema";
import { HevyApiError } from "./client";
import type { HevyClient } from "./client";

// Sync is the one place this app writes to Hevy, and Hevy has no DELETE and a
// routine cap — a duplicate routine is permanent. These tests pin the
// create-once-then-PUT contract, including what happens when a sync dies
// halfway through.

let sync: typeof import("./sync");
let plansModule: typeof import("@/lib/plans");
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "hevy-sync-"));
  process.env.DATABASE_PATH = join(dir, "test.sqlite");
  const { runMigrations } = await import("@/lib/db/migrate");
  runMigrations();
  sync = await import("./sync");
  plansModule = await import("@/lib/plans");
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* Windows holds the SQLite lock until exit */
  }
});

function plan(dayTitles = ["Push", "Pull"]): Plan {
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

interface Recorder {
  client: HevyClient;
  folders: string[];
  creates: string[];
  updates: string[];
}

/** Stub Hevy client. `failOnCreate` makes the Nth create (1-based) throw. */
function recorder(options: { failOnCreate?: number; createStatus?: number } = {}): Recorder {
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

let planId: number;

beforeEach(async () => {
  const { db } = await import("@/lib/db/client");
  const { syncLinks, plans } = await import("@/lib/db/schema");
  await db.delete(syncLinks);
  await db.delete(plans);
  planId = await plansModule.createPlan({
    goal: "Build muscle",
    sessionMinutes: 60,
    sessionsPerWeek: 2,
    split: "auto",
    experience: "intermediate",
    equipment: ["barbell"],
  });
});

describe("first sync", () => {
  it("creates one folder and one routine per training day", async () => {
    const rec = recorder();
    const summary = await sync.syncPlan(rec.client, planId, plan());

    expect(rec.folders).toEqual(["Test Plan"]);
    expect(rec.creates).toEqual(["Push", "Pull"]);
    expect(rec.updates).toEqual([]);
    expect(summary).toMatchObject({ created: 2, updated: 0, unchanged: 0 });
  });
});

describe("re-sync", () => {
  it("creates nothing the second time and skips unchanged days", async () => {
    const first = recorder();
    await sync.syncPlan(first.client, planId, plan());

    const second = recorder();
    const summary = await sync.syncPlan(second.client, planId, plan());

    // The critical assertion: no second folder, no duplicate routines.
    expect(second.folders).toEqual([]);
    expect(second.creates).toEqual([]);
    expect(second.updates).toEqual([]);
    expect(summary).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
  });

  it("PUTs only the days whose content changed", async () => {
    const first = recorder();
    await sync.syncPlan(first.client, planId, plan());

    const edited = plan();
    edited.days[1]!.exercises[0]!.restSeconds = 120;

    const second = recorder();
    const summary = await sync.syncPlan(second.client, planId, edited);

    expect(second.creates).toEqual([]);
    expect(second.updates).toEqual(["routine-2:Pull"]);
    expect(summary).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
  });
});

describe("failure mid-sync", () => {
  /**
   * The folder id used to live only on sync_links rows, which are written only
   * after a routine create succeeds. So a first sync whose FIRST create failed
   * — the routine-cap 403 this design explicitly expects — lost the folder id,
   * and the retry created a second folder. Folders have no DELETE endpoint, so
   * every failed-then-retried first sync leaked one permanently.
   */
  it("never creates a second folder after a failed first create", async () => {
    const failing = recorder({ failOnCreate: 1, createStatus: 403 });
    await expect(sync.syncPlan(failing.client, planId, plan())).rejects.toMatchObject({
      status: 403,
    });
    expect(failing.folders).toHaveLength(1);
    expect(failing.creates).toEqual([]);

    // User frees quota in Hevy and retries.
    const retry = recorder();
    await sync.syncPlan(retry.client, planId, plan());

    expect(retry.folders).toEqual([]);
    expect(retry.creates).toEqual(["Push", "Pull"]);
  });

  it("keeps what it created, so a retry resumes instead of duplicating", async () => {
    const failing = recorder({ failOnCreate: 2 });
    await expect(sync.syncPlan(failing.client, planId, plan())).rejects.toThrow(HevyApiError);
    // The first day was created before the failure.
    expect(failing.creates).toEqual(["Push"]);

    const retry = recorder();
    const summary = await sync.syncPlan(retry.client, planId, plan());

    // Day 1 is already linked: not re-created, and no second folder.
    expect(retry.folders).toEqual([]);
    expect(retry.creates).toEqual(["Pull"]);
    expect(summary).toMatchObject({ created: 1, unchanged: 1 });
  });

  it("surfaces a 403 routine-cap rejection instead of retrying it", async () => {
    const capped = recorder({ failOnCreate: 1, createStatus: 403 });
    await expect(sync.syncPlan(capped.client, planId, plan())).rejects.toMatchObject({
      status: 403,
    });
    expect(capped.creates).toEqual([]);
  });
});

describe("refusing unsafe writes", () => {
  /**
   * An empty routine would permanently consume part of the routine cap for
   * something useless, and no API call can delete it afterwards.
   */
  it("refuses to push a day with no exercises, before touching Hevy", async () => {
    const empty = plan();
    empty.days[1]!.exercises = [];

    const rec = recorder();
    await expect(sync.syncPlan(rec.client, planId, empty)).rejects.toThrow(/no exercises/i);
    expect(rec.folders).toEqual([]);
    expect(rec.creates).toEqual([]);
  });
});

describe("getSyncState", () => {
  it("reports nothing synced for a fresh plan", async () => {
    expect(await sync.getSyncState(planId, plan())).toMatchObject({
      syncedDays: 0,
      hasPendingChanges: true,
    });
  });

  it("reports up-to-date after a sync, and pending after an edit", async () => {
    await sync.syncPlan(recorder().client, planId, plan());
    expect(await sync.getSyncState(planId, plan())).toMatchObject({
      syncedDays: 2,
      hasPendingChanges: false,
    });

    const edited = plan();
    edited.days[0]!.exercises[0]!.sets.push({
      type: "normal",
      repRange: { start: 8, end: 12 },
      weightKg: null,
    });
    expect(await sync.getSyncState(planId, edited)).toMatchObject({ hasPendingChanges: true });
  });

  it("treats a newly added training day as pending", async () => {
    await sync.syncPlan(recorder().client, planId, plan());
    const withExtraDay = plan(["Push", "Pull", "Legs"]);
    expect(await sync.getSyncState(planId, withExtraDay)).toMatchObject({
      hasPendingChanges: true,
    });
  });

  it("never reports up-to-date while a routine is stranded by a shrunken plan", async () => {
    await sync.syncPlan(recorder().client, planId, plan(["Push", "Pull"]));
    // The plan lost a day; the routine for it still exists in Hevy and cannot
    // be deleted through the API.
    expect(await sync.getSyncState(planId, plan(["Push"]))).toMatchObject({
      staleRoutines: 1,
      hasPendingChanges: true,
    });
  });
});
