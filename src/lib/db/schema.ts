import {
  boolean,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { json } from "./json-column";
import type { SavedProfile } from "@/lib/planner/profile-defaults";
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

// The standing trainee profile: the answers that do not change between plans.
//
// A SINGLETON — `id` is always PROFILE_ROW_ID. The app is single-tenant today
// (nothing else here carries a user id either), and when open signup lands this
// table gains a `user_id` unique key rather than a different shape.
//
// One JSON document rather than a column per field, for the same reason
// `plans.request` is one: it is read and written whole, never filtered or
// grouped by any single field, and its shape tracks planRequestSchema — which
// has already gained and retired fields twice. A column per answer would turn
// each of those into a migration.
//
// Not a row in `settings` because that table's `value` is varchar(1024), and
// notes (500) plus injuries (200) plus a goal sentence plus JSON overhead does
// not reliably fit. A silently truncated profile is the worst failure available.
export const traineeProfile = mysqlTable("trainee_profile", {
  id: int("id").primaryKey(),
  profile: json("profile").$type<SavedProfile>().notNull(),
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

// Local mirror of the account's completed workouts, kept current by the
// /v1/workouts/events delta feed. STRICTLY read-only with respect to Hevy:
// nothing in these two tables is ever pushed back.
//
// A cache rather than on-demand fetching, because /records has to aggregate
// across EVERY exercise at once and the workouts endpoint caps pageSize at 10 —
// answering "what are my PRs" over the network would be hundreds of requests per
// page view. One explicit backfill, then deltas.
export const workouts = mysqlTable("workouts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  routineId: varchar("routine_id", { length: 64 }),
  startTime: varchar("start_time", { length: 32 }).notNull(),
  endTime: varchar("end_time", { length: 32 }),
  // The cursor source: `events?since=` compares against this, so the sync stores
  // the largest value it has seen rather than its own clock. Using local time
  // would skip every workout logged while the two disagreed.
  hevyUpdatedAt: varchar("hevy_updated_at", { length: 32 }).notNull(),
  fetchedAt: varchar("fetched_at", { length: 32 }).notNull(),
});

// One row per logged set, flattened out of workout.exercises[].sets[]. Flat
// because every records query groups by exercise across all workouts, which a
// JSON blob per workout could not index.
export const workoutSets = mysqlTable(
  "workout_sets",
  {
    id: int("id").autoincrement().primaryKey(),
    workoutId: varchar("workout_id", { length: 64 })
      .notNull()
      .references(() => workouts.id),
    exerciseTemplateId: varchar("exercise_template_id", { length: 64 }).notNull(),
    // Denormalised from the workout payload on purpose, NOT joined from
    // exercise_templates: history can reference templates the catalog no longer
    // has (a deleted custom exercise), and a record must not disappear from the
    // page because the catalog cache is stale or was never refreshed.
    exerciseTitle: varchar("exercise_title", { length: 255 }).notNull(),
    exerciseIndex: int("exercise_index").notNull(),
    setIndex: int("set_index").notNull(),
    // warmup | normal | failure | dropset, but stored as free text: an unknown
    // value from upstream must cache rather than abort the walk.
    setType: varchar("set_type", { length: 32 }).notNull(),
    // Nullable throughout: a set carries only the metrics its exercise type
    // uses, so bodyweight sets have reps and no weight, planks the reverse.
    weightKg: double("weight_kg"),
    reps: int("reps"),
    rpe: double("rpe"),
    durationSeconds: int("duration_seconds"),
    distanceMeters: int("distance_meters"),
  },
  (table) => [
    // Every records query filters or groups by template id.
    index("workout_sets_template").on(table.exerciseTemplateId),
    // A delta event replaces one workout's sets wholesale; without this the
    // delete would scan the entire history table on every update event.
    index("workout_sets_workout").on(table.workoutId),
  ],
);
