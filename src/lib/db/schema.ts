import { boolean, int, mysqlEnum, mysqlTable, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { json } from "./json-column";
import type { Plan, PlanRequest } from "@/lib/planner/schema";

// MariaDB via the mysql dialect. Two dialect rules shape the column choices
// below and are easy to trip over when editing:
//   - an indexed/primary-key string column must be a bounded varchar; TEXT
//     cannot be a primary key without a prefix length.
//   - JSON columns use ./json-column, NOT drizzle's json() — see that file.
// Timestamps stay ISO-8601 strings (varchar 32) rather than DATETIME: the app
// compares and sorts them as strings throughout, and ISO-8601 sorts correctly.

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: varchar("value", { length: 1024 }).notNull(),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
});

// Local cache of Hevy's exercise_templates library. Mandatory: the Hevy API has
// no search/filter, so candidate filtering happens here (WHERE, not JSON).
export const exerciseTemplates = mysqlTable("exercise_templates", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  primaryMuscleGroup: varchar("primary_muscle_group", { length: 64 }).notNull(),
  secondaryMuscleGroups: json("secondary_muscle_groups").$type<string[]>().notNull(),
  equipmentCategory: varchar("equipment_category", { length: 64 }).notNull(),
  isCustom: boolean("is_custom").notNull().default(false),
  fetchedAt: varchar("fetched_at", { length: 32 }).notNull(),
});

// The plan is a JSON document, not normalized tables — edited and synced as a
// whole; only relational state (catalog, sync links) gets real tables.
export const plans = mysqlTable("plans", {
  id: int("id").autoincrement().primaryKey(),
  request: json("request").$type<PlanRequest>().notNull(),
  plan: json("plan").$type<Plan>(),
  status: mysqlEnum("status", ["draft", "generated", "synced"]).notNull().default("draft"),
  // The Hevy folder created for this plan, recorded the instant the create
  // returns. It lives here rather than only on sync_links because those rows
  // appear only after a routine is created: if the FIRST routine create fails
  // (the routine cap 403 this design expects), a folder-id kept solely on
  // sync_links would be lost, and the retry would create a second folder that
  // can never be deleted.
  hevyFolderId: int("hevy_folder_id"),
  // The plan this one was forked from, if any. Editing a plan's request never
  // overwrites it — it writes a NEW plan and points back here (owner's call), so
  // an edit can never destroy a plan that is already synced to Hevy.
  //
  // Deliberately NOT a foreign key, even though it names a plans.id. A self
  // reference would make deleting an original fail while a fork survives, or
  // cascade the delete into forks that are perfectly good plans in their own
  // right. A dangling id is the better failure: the UI reads it as "forked from
  // a plan that no longer exists" and shows nothing.
  derivedFromPlanId: int("derived_from_plan_id"),
  createdAt: varchar("created_at", { length: 32 }).notNull(),
  updatedAt: varchar("updated_at", { length: 32 }).notNull(),
});

// One row per synced training day: which Hevy routine holds it, and a hash of
// what was pushed (re-sync PUTs only days whose hash changed). Hevy folder ids
// are numbers, routine ids strings — the API is inconsistent; we mirror it.
export const syncLinks = mysqlTable(
  "sync_links",
  {
    id: int("id").autoincrement().primaryKey(),
    planId: int("plan_id")
      .notNull()
      .references(() => plans.id),
    dayIndex: int("day_index").notNull(),
    hevyFolderId: int("hevy_folder_id").notNull(),
    hevyRoutineId: varchar("hevy_routine_id", { length: 64 }).notNull(),
    // sha256 hex from routineHash(), so exactly 64 characters.
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    lastSyncedAt: varchar("last_synced_at", { length: 32 }).notNull(),
  },
  // A day may be linked to exactly one routine, so a corrupted link table can
  // never make a later sync PUT the wrong routine. Note what this does NOT do:
  // it fires only after a duplicate routine already exists in Hevy, so it
  // protects the database, not Hevy. Preventing the duplicate write itself is
  // the job of the lock in lib/hevy/plan-lock.ts.
  (table) => [uniqueIndex("sync_links_plan_day").on(table.planId, table.dayIndex)],
);
