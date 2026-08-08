import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HevyApiError } from "./client";
import { fixturePlan as plan, recorder, resetPlanState, createTempDatabase } from "@/test/sync-fixture";

// Sync is the one place this app writes to Hevy, and Hevy has no DELETE and a
// routine cap — a duplicate routine is permanent. These tests pin the
// create-once-then-PUT contract, including what happens when a sync dies
// halfway through, races another sync, or is handed a plan it must refuse.

const database = createTempDatabase("hevy_sync");
let sync: typeof import("./sync");
let planId: number;

beforeAll(async () => {
  await database.migrate();
  sync = await import("./sync");
});

afterAll(() => database.cleanup());

beforeEach(async () => {
  planId = await resetPlanState();
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

  /**
   * Plans synced before the folder id moved onto the plans row have it only on
   * their sync_links rows. They must keep working, and must get backfilled so
   * they gain the same protection as a new plan.
   */
  it("adopts the folder id of a plan synced before the column existed", async () => {
    const { db } = await import("@/lib/db/client");
    const { plans } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    await sync.syncPlan(recorder().client, planId, plan());
    // Simulate the pre-migration state: links carry the folder, the plan doesn't.
    await db.update(plans).set({ hevyFolderId: null }).where(eq(plans.id, planId));

    const edited = plan();
    edited.days[0]!.exercises[0]!.restSeconds = 150;
    const rec = recorder();
    await sync.syncPlan(rec.client, planId, edited);

    expect(rec.folders).toEqual([]);
    expect(rec.creates).toEqual([]);
    const [row] = await db
      .select({ hevyFolderId: plans.hevyFolderId })
      .from(plans)
      .where(eq(plans.id, planId));
    expect(row!.hevyFolderId).not.toBeNull();
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

describe("concurrent syncs", () => {
  /**
   * Two tabs, or a double-click that outran the disabled button. Both runs read
   * "nothing synced yet" before either writes, so without serialisation both
   * create a folder and a routine — and Hevy cannot delete either. The UNIQUE
   * index alone does not help: it rejects the second link row only after the
   * duplicate routine already exists in Hevy.
   */
  it("never double-writes to Hevy when two syncs start at once", async () => {
    const a = recorder();
    const b = recorder();

    const [first, second] = await Promise.all([
      sync.syncPlan(a.client, planId, plan()),
      sync.syncPlan(b.client, planId, plan()),
    ]);

    expect([...a.folders, ...b.folders]).toHaveLength(1);
    expect([...a.creates, ...b.creates].sort()).toEqual(["Pull", "Push"]);
    // The one that ran second finds everything already linked.
    expect(first.created + second.created).toBe(2);
    expect(first.unchanged + second.unchanged).toBe(2);
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

  /**
   * An id Hevy doesn't know 400s on write — but only after the earlier days are
   * already permanent routines. The generator's validator flags this, yet
   * nothing stopped the user pressing sync on a plan showing that warning.
   */
  it("refuses a plan referencing an exercise outside the cached catalog", async () => {
    const bogus = plan();
    bogus.days[1]!.exercises[0]!.exerciseTemplateId = "not-in-catalog";

    const rec = recorder();
    await expect(sync.syncPlan(rec.client, planId, bogus)).rejects.toThrow(/not in the cached/i);
    expect(rec.folders).toEqual([]);
    expect(rec.creates).toEqual([]);
  });
});

