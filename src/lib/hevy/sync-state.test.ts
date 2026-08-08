import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fixturePlan, recorder, resetPlanState, createTempDatabase } from "@/test/sync-fixture";

// getSyncState feeds the plan page's "up to date" / "changes to sync" wording,
// so anything it gets wrong becomes a claim the UI makes falsely.

const database = createTempDatabase();
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

describe("getSyncState", () => {
  it("reports nothing synced for a fresh plan", async () => {
    expect(await sync.getSyncState(planId, fixturePlan())).toMatchObject({
      syncedDays: 0,
      hasPendingChanges: true,
      staleRoutines: 0,
    });
  });

  it("reports up-to-date after a sync, and pending after an edit", async () => {
    await sync.syncPlan(recorder().client, planId, fixturePlan());
    expect(await sync.getSyncState(planId, fixturePlan())).toMatchObject({
      syncedDays: 2,
      hasPendingChanges: false,
    });

    const edited = fixturePlan();
    edited.days[0]!.exercises[0]!.sets.push({
      type: "normal",
      repRange: { start: 8, end: 12 },
      weightKg: null,
    });
    expect(await sync.getSyncState(planId, edited)).toMatchObject({ hasPendingChanges: true });
  });

  it("treats a newly added training day as pending", async () => {
    await sync.syncPlan(recorder().client, planId, fixturePlan());
    expect(await sync.getSyncState(planId, fixturePlan(["Push", "Pull", "Legs"]))).toMatchObject({
      hasPendingChanges: true,
    });
  });

  it("never reports up-to-date while a routine is stranded by a shrunken plan", async () => {
    await sync.syncPlan(recorder().client, planId, fixturePlan(["Push", "Pull"]));
    // The plan lost a day; its routine still exists in Hevy and cannot be
    // deleted through the API.
    expect(await sync.getSyncState(planId, fixturePlan(["Push"]))).toMatchObject({
      staleRoutines: 1,
      hasPendingChanges: true,
    });
  });
});

describe("dashboard sync label", () => {
  /**
   * The dashboard and the plan page used to derive sync state differently — the
   * dashboard from the `status` column, the plan page from content hashes.
   * Regenerating a synced plan reset the status while the hashes still matched,
   * so the dashboard said "Not synced" and the plan page said "up to date" at
   * the same time. Both now read the hashes.
   */
  it("agrees with the plan page after a regenerate that changed nothing", async () => {
    const { listPlans, savePlan } = await import("@/lib/plans");
    await sync.syncPlan(recorder().client, planId, fixturePlan());

    // The deterministic generator reproducing an identical plan.
    await savePlan(planId, fixturePlan());

    const [listed] = await listPlans();
    const state = await sync.getSyncState(planId, fixturePlan());
    expect(state.hasPendingChanges).toBe(false);
    expect(listed!.syncLabel).toBe("synced");
  });

  it("says changes are pending once the plan actually differs", async () => {
    const { listPlans, savePlan } = await import("@/lib/plans");
    await sync.syncPlan(recorder().client, planId, fixturePlan());

    const edited = fixturePlan();
    edited.days[0]!.exercises[0]!.restSeconds = 150;
    await savePlan(planId, edited);

    const [listed] = await listPlans();
    expect(listed!.syncLabel).toBe("changes_pending");
  });

  it("labels a plan with no generated sessions as a draft", async () => {
    const { listPlans } = await import("@/lib/plans");
    const [listed] = await listPlans();
    expect(listed!.syncLabel).toBe("draft");
  });
});
