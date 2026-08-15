import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase } from "@/test/database";

// One database per FILE, named before anything imports the db client: the
// client resolves DATABASE_URL once at module evaluation, so the store may only
// be imported dynamically, after migrate() has run.
const database = createTempDatabase("hevy_profile");
let store: typeof import("./profile-store");

beforeAll(async () => {
  await database.migrate();
  store = await import("./profile-store");
});

afterAll(() => database.cleanup());

beforeEach(async () => {
  await store.clearProfile();
});

describe("profile store", () => {
  it("returns null when nothing has been saved", async () => {
    expect(await store.getSavedProfile()).toBeNull();
    expect(await store.getProfileStatus()).toEqual({ profile: null, updatedAt: null });
  });

  it("round-trips a profile through the JSON column", async () => {
    // MariaDB's JSON is a LONGTEXT alias, which is exactly why this app has its
    // own json-column type — a round trip is the only proof it works here.
    await store.saveProfile({
      bodyweightKg: 82,
      phase: "cut",
      currentLifts: { squatKg: 140, benchKg: 100 },
      focusMuscleGroups: ["chest", "lats"],
      equipment: ["barbell", "dumbbell"],
      notes: "I run on Tuesdays",
    });

    const saved = await store.getSavedProfile();
    expect(saved).toEqual({
      bodyweightKg: 82,
      phase: "cut",
      currentLifts: { squatKg: 140, benchKg: 100 },
      focusMuscleGroups: ["chest", "lats"],
      equipment: ["barbell", "dumbbell"],
      notes: "I run on Tuesdays",
    });
  });

  it("replaces rather than merges, so clearing a field really clears it", async () => {
    // The behaviour a merge would break: a bodyweight that cannot be removed
    // is a stale number feeding suggested loads forever.
    await store.saveProfile({ bodyweightKg: 82, phase: "cut" });
    await store.saveProfile({ phase: "bulk" });

    expect(await store.getSavedProfile()).toEqual({ phase: "bulk" });
  });

  it("upserts on the singleton row instead of accumulating rows", async () => {
    await store.saveProfile({ phase: "cut" });
    const first = await store.getProfileStatus();
    await store.saveProfile({ phase: "bulk" });
    const second = await store.getProfileStatus();

    expect(second.profile).toEqual({ phase: "bulk" });
    expect(first.updatedAt).not.toBeNull();
    expect(second.updatedAt).not.toBeNull();
  });

  it("deletes the row rather than storing a profile that answers nothing", async () => {
    await store.saveProfile({ phase: "cut" });
    await store.saveProfile({});

    // Not merely "reads as null" — the row itself must be gone, or the page
    // would report a last-saved time for a profile with nothing in it.
    expect(await store.getProfileStatus()).toEqual({ profile: null, updatedAt: null });
  });

  it("ignores a stored document the schema no longer accepts", async () => {
    // A profile is a convenience. Throwing here would take /plans/new down with
    // it, which is a far worse outcome than a re-typed form.
    await store.saveProfile({ phase: "cut" });
    const { db } = await import("@/lib/db/client");
    const { traineeProfile } = await import("@/lib/db/schema");
    await db
      .update(traineeProfile)
      // @ts-expect-error deliberately writing a shape the schema rejects.
      .set({ profile: { split: "bro_split" } });

    expect(await store.getSavedProfile()).toBeNull();
  });
});
