import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Plan, PlanRequest } from "@/lib/planner/schema";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Local cache of Hevy's exercise_templates library. Mandatory: the Hevy API has
// no search/filter, so candidate filtering happens here (WHERE, not JSON).
export const exerciseTemplates = sqliteTable("exercise_templates", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  primaryMuscleGroup: text("primary_muscle_group").notNull(),
  secondaryMuscleGroups: text("secondary_muscle_groups", { mode: "json" })
    .$type<string[]>()
    .notNull(),
  equipmentCategory: text("equipment_category").notNull(),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  fetchedAt: text("fetched_at").notNull(),
});

// The plan is a JSON document, not normalized tables — edited and synced as a
// whole; only relational state (catalog, sync links) gets real tables.
export const plans = sqliteTable("plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  request: text("request", { mode: "json" }).$type<PlanRequest>().notNull(),
  plan: text("plan", { mode: "json" }).$type<Plan>(),
  status: text("status", { enum: ["draft", "generated", "synced"] })
    .notNull()
    .default("draft"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// One row per synced training day: which Hevy routine holds it, and a hash of
// what was pushed (re-sync PUTs only days whose hash changed). Hevy folder ids
// are numbers, routine ids strings — the API is inconsistent; we mirror it.
export const syncLinks = sqliteTable("sync_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id),
  dayIndex: integer("day_index").notNull(),
  hevyFolderId: integer("hevy_folder_id").notNull(),
  hevyRoutineId: text("hevy_routine_id").notNull(),
  contentHash: text("content_hash").notNull(),
  lastSyncedAt: text("last_synced_at").notNull(),
});
