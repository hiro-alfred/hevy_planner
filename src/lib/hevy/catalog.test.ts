import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTempDatabase } from "@/test/database";
import type { HevyClient } from "./client";
import type { HevyExerciseTemplate } from "./types";

// The db client resolves DATABASE_URL at import time, so the throwaway database
// has to be claimed before any module that imports it is loaded — hence the
// top-level call here and the dynamic imports below.
const database = createTempDatabase("hevy_catalog");
let catalog: typeof import("./catalog");

beforeAll(async () => {
  await database.migrate();
  catalog = await import("./catalog");
});

afterAll(() => database.cleanup());

function template(overrides: Partial<HevyExerciseTemplate> = {}): HevyExerciseTemplate {
  return {
    id: "t1",
    title: "Bench Press (Barbell)",
    type: "weight_reps",
    primary_muscle_group: "chest",
    secondary_muscle_groups: ["triceps"],
    equipment_category: "barbell",
    is_custom: false,
    ...overrides,
  };
}

/** Stub client that serves fixed pages, and counts how often it was called. */
function stubClient(pages: HevyExerciseTemplate[][]) {
  const calls: number[] = [];
  const client = {
    getExerciseTemplates: async (page: number) => {
      calls.push(page);
      return {
        page,
        page_count: pages.length,
        exercise_templates: pages[page - 1] ?? [],
      };
    },
  } as unknown as HevyClient;
  return { client, calls };
}

describe("refreshCatalog", () => {
  beforeEach(async () => {
    const { db } = await import("@/lib/db/client");
    const { exerciseTemplates } = await import("@/lib/db/schema");
    await db.delete(exerciseTemplates);
  });

  it("walks every page and caches all templates", async () => {
    const { client, calls } = stubClient([
      [template({ id: "a" }), template({ id: "b" })],
      [template({ id: "c" })],
    ]);

    const count = await catalog.refreshCatalog(client);

    expect(count).toBe(3);
    expect(calls).toEqual([1, 2]);
    const status = await catalog.getCatalogStatus();
    expect(status.count).toBe(3);
    expect(status.lastRefreshedAt).not.toBeNull();
  });

  it("updates changed rows and prunes templates that vanished upstream", async () => {
    await catalog.refreshCatalog(
      stubClient([[template({ id: "a" }), template({ id: "gone" })]]).client,
    );

    await catalog.refreshCatalog(
      stubClient([[template({ id: "a", title: "Renamed Press" })]]).client,
    );

    expect(await catalog.getCatalogStatus()).toMatchObject({ count: 1 });
    expect((await catalog.getTemplateById("a"))?.title).toBe("Renamed Press");
    expect(await catalog.getTemplateById("gone")).toBeNull();
  });

  it("refuses to prune when the API returns nothing", async () => {
    await catalog.refreshCatalog(stubClient([[template({ id: "a" })]]).client);

    await expect(catalog.refreshCatalog(stubClient([[]]).client)).rejects.toThrow(
      /no exercise templates/i,
    );

    // The pre-existing cache must survive a failed refresh.
    expect(await catalog.getCatalogStatus()).toMatchObject({ count: 1 });
  });

  it("aborts instead of writing a truncated walk", async () => {
    await catalog.refreshCatalog(stubClient([[template({ id: "a" })]]).client);

    // A page_count beyond the safety cap means the API is misbehaving; writing
    // the first 200 pages would delete every template living past them.
    const runaway = {
      getExerciseTemplates: async (page: number) => ({
        page,
        page_count: 5000,
        exercise_templates: [template({ id: `p${page}` })],
      }),
    } as unknown as HevyClient;

    await expect(catalog.refreshCatalog(runaway)).rejects.toThrow(/aborted/i);
    expect(await catalog.getCatalogStatus()).toMatchObject({ count: 1 });
    expect(await catalog.getTemplateById("a")).not.toBeNull();
  });

  it("tolerates a duplicate id appearing across shifting pages", async () => {
    const { client } = stubClient([[template({ id: "dupe" })], [template({ id: "dupe" })]]);
    await expect(catalog.refreshCatalog(client)).resolves.toBe(1);
  });
});

describe("getCandidates", () => {
  beforeEach(async () => {
    await catalog.refreshCatalog(
      stubClient([
        [
          template({ id: "bb-bench", equipment_category: "barbell", primary_muscle_group: "chest" }),
          template({
            id: "db-curl",
            title: "Bicep Curl (Dumbbell)",
            equipment_category: "dumbbell",
            primary_muscle_group: "biceps",
            secondary_muscle_groups: [],
          }),
          template({
            id: "row-machine",
            title: "Seated Row (Machine)",
            equipment_category: "machine",
            primary_muscle_group: "lats",
            secondary_muscle_groups: ["biceps"],
          }),
          template({
            id: "plank",
            title: "Plank",
            type: "duration",
            equipment_category: "none",
            primary_muscle_group: "abdominals",
            secondary_muscle_groups: [],
          }),
        ],
      ]).client,
    );
  });

  it("filters by equipment", async () => {
    const rows = await catalog.getCandidates({ equipment: ["barbell", "machine"] });
    expect(rows.map((r) => r.id).sort()).toEqual(["bb-bench", "row-machine"]);
  });

  it("matches a muscle group as primary OR secondary", async () => {
    const rows = await catalog.getCandidates({ muscleGroups: ["biceps"] });
    expect(rows.map((r) => r.id).sort()).toEqual(["db-curl", "row-machine"]);
  });

  it("orders primary-muscle matches ahead of secondary-only ones", async () => {
    const rows = await catalog.getCandidates({ muscleGroups: ["biceps"] });
    expect(rows[0]!.id).toBe("db-curl");
  });

  it("excludes duration/distance templates unless asked", async () => {
    const withoutPlank = await catalog.getCandidates({ muscleGroups: ["abdominals"] });
    expect(withoutPlank).toHaveLength(0);

    const withPlank = await catalog.getCandidates({
      muscleGroups: ["abdominals"],
      includeNonRepBased: true,
    });
    expect(withPlank.map((r) => r.id)).toEqual(["plank"]);
  });

  it("honours the limit", async () => {
    expect(await catalog.getCandidates({ limit: 2 })).toHaveLength(2);
  });
});

describe("lookups", () => {
  beforeEach(async () => {
    await catalog.refreshCatalog(
      stubClient([
        [
          template({ id: "a", title: "Bench Press (Barbell)" }),
          template({ id: "b", title: "100% Effort Row" }),
        ],
      ]).client,
    );
  });

  it("resolves many ids in one query", async () => {
    const found = await catalog.getTemplatesByIds(["a", "b", "a", "missing"]);
    expect([...found.keys()].sort()).toEqual(["a", "b"]);
  });

  it("returns an empty map for no ids", async () => {
    expect((await catalog.getTemplatesByIds([])).size).toBe(0);
  });

  it("searches titles and treats LIKE wildcards literally", async () => {
    expect((await catalog.searchTemplates("bench")).map((r) => r.id)).toEqual(["a"]);
    // "%" must match the literal character in "100% Effort Row", not everything.
    expect((await catalog.searchTemplates("%")).map((r) => r.id)).toEqual(["b"]);
    expect(await catalog.searchTemplates("   ")).toEqual([]);
  });

  it("lists the distinct equipment present in the cache", async () => {
    expect(await catalog.getAvailableEquipment()).toEqual(["barbell"]);
  });
});
