import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { exerciseTemplates } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import type { HevyClient } from "./client";
import type { HevyExerciseTemplate } from "./types";

// Catalog service: pages the ENTIRE exercise_templates library into the
// exercise_templates table (the API has no search — a local cache is the only
// way to resolve names/filters), then serves candidate lists for generation.
// See knowledge/decisions/plan-pipeline.md, stage 2.

export type CatalogRow = typeof exerciseTemplates.$inferSelect;

// Safety valve: the API reports page_count, but a broken/looping response must
// not spin forever. 200 pages × 100 = 20k templates, far above the real library.
const MAX_PAGES = 200;

// 8 columns per row. MariaDB caps a prepared statement at 65535 placeholders
// and the whole packet at max_allowed_packet (16MB by default); chunking keeps
// a single multi-row insert far inside both.
const INSERT_CHUNK = 100;

// Set types that a sets × reps plan can express (planner/schema.ts models every
// set as a rep range). Duration/distance templates would produce nonsense sets,
// so they are excluded from candidate lists unless explicitly asked for.
const REP_BASED_TYPES = [
  "weight_reps",
  "reps_only",
  "bodyweight_reps",
  "bodyweight_assisted_reps",
] as const;

function toRow(t: HevyExerciseTemplate, fetchedAt: string) {
  return {
    id: t.id,
    title: t.title,
    type: t.type,
    primaryMuscleGroup: t.primary_muscle_group,
    secondaryMuscleGroups: t.secondary_muscle_groups ?? [],
    equipmentCategory: t.equipment_category,
    isCustom: t.is_custom ?? false,
    fetchedAt,
  };
}

/**
 * Walks the whole exercise_templates library and replaces the local cache.
 *
 * The network walk happens first and entirely outside the transaction: a failed
 * or partial fetch must leave the previous cache untouched rather than
 * truncating it. Only once the walk has provably completed do we swap the table
 * contents inside one transaction.
 *
 * @returns the number of templates cached.
 */
export async function refreshCatalog(client: HevyClient): Promise<number> {
  const fetchedAt = new Date().toISOString();
  const templates: HevyExerciseTemplate[] = [];

  let page = 1;
  let pageCount = 1;
  do {
    const res = await client.getExerciseTemplates(page);
    templates.push(...(res.exercise_templates ?? []));
    // page_count is a page total, not an item total (see hevy-api).
    pageCount = res.page_count || 1;
    if (pageCount > MAX_PAGES) {
      // Stopping at the cap and writing anyway would delete every template
      // living beyond it. A library this large means the API is misbehaving.
      throw new UserFacingError(
        `Catalog refresh aborted: Hevy reported ${pageCount} pages (max ${MAX_PAGES}); the cache was left unchanged.`,
      );
    }
    page += 1;
  } while (page <= pageCount);

  // De-duplicate defensively: pages can shift underneath a multi-request walk,
  // and a repeated id would break the multi-row insert on its own conflict.
  const rows = [...new Map(templates.map((t) => [t.id, toRow(t, fetchedAt)])).values()];

  if (rows.length === 0) {
    // An empty library is far more likely to be an API fault than the truth —
    // replacing the table here would wipe a working cache.
    throw new UserFacingError(
      "Hevy returned no exercise templates; the cached catalog was left unchanged.",
    );
  }

  // Clear-then-insert, not upsert-then-prune-by-timestamp: two refreshes inside
  // the same millisecond share a fetchedAt, which would make a timestamp-based
  // prune silently keep gone-upstream rows. The transaction means readers never
  // observe the empty window.
  await db.transaction(async (tx) => {
    await tx.delete(exerciseTemplates);
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.insert(exerciseTemplates).values(rows.slice(i, i + INSERT_CHUNK));
    }
  });

  return rows.length;
}

export interface CatalogStatus {
  count: number;
  lastRefreshedAt: string | null;
}

/** Row count + freshness of the cache, in one query (used by the UI). */
export async function getCatalogStatus(): Promise<CatalogStatus> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)`,
      lastRefreshedAt: sql<string | null>`max(${exerciseTemplates.fetchedAt})`,
    })
    .from(exerciseTemplates);
  return { count: row?.count ?? 0, lastRefreshedAt: row?.lastRefreshedAt ?? null };
}

export interface CandidateFilter {
  /** Hevy EquipmentCategory values available to the trainee. Empty = no filter. */
  equipment?: string[];
  /** Muscle groups the split needs. Matches primary OR secondary. Empty = no filter. */
  muscleGroups?: string[];
  /** Include duration/distance templates too. Default false. */
  includeNonRepBased?: boolean;
  /** Cap on returned rows; the prompt targets ~100–150 candidates. */
  limit?: number;
}

/**
 * Matches templates against a secondary muscle group.
 *
 * secondary_muscle_groups is a JSON array column, so the match is an OR of
 * JSON_CONTAINS probes — one per requested group, all inside the SAME query.
 * The alternative (fetch all, filter in JS) is the N+1-shaped pattern the
 * project rules ban.
 *
 * Why not the obvious one-call forms: MariaDB has no JSON_OVERLAPS (that is
 * MySQL 8 only) and no json_each() table function, so neither a single
 * set-overlap call nor a correlated EXISTS over the array is available here.
 * JSON_QUOTE turns each bound value into the quoted scalar JSON_CONTAINS wants,
 * so a group name containing a quote cannot break out of the comparison.
 */
function secondaryMuscleMatch(muscleGroups: string[]): SQL {
  return or(
    ...muscleGroups.map(
      (m) =>
        sql`json_contains(${exerciseTemplates.secondaryMuscleGroups}, json_quote(${m}))`,
    ),
  )!;
}

/**
 * Candidate list for plan generation: everything the trainee can actually do,
 * narrowed to the muscle groups the requested split needs.
 *
 * Ordering puts primary-muscle matches first and built-in exercises before
 * custom ones, so a `limit` truncates the least relevant tail rather than an
 * arbitrary slice.
 */
export async function getCandidates(filter: CandidateFilter = {}): Promise<CatalogRow[]> {
  const { equipment = [], muscleGroups = [], includeNonRepBased = false, limit = 150 } = filter;

  const conditions: SQL[] = [];
  if (equipment.length > 0) {
    conditions.push(inArray(exerciseTemplates.equipmentCategory, equipment));
  }
  if (muscleGroups.length > 0) {
    conditions.push(
      or(
        inArray(exerciseTemplates.primaryMuscleGroup, muscleGroups),
        secondaryMuscleMatch(muscleGroups),
      )!,
    );
  }
  if (!includeNonRepBased) {
    conditions.push(inArray(exerciseTemplates.type, [...REP_BASED_TYPES]));
  }

  // Only rank by primary-match when there is something to match against: a bare
  // constant here would be parsed as an ORDER BY column ordinal (MariaDB does
  // this too, so the guard survived the move off SQLite).
  const order: SQL[] = [];
  if (muscleGroups.length > 0) {
    order.push(
      sql`case when ${inArray(exerciseTemplates.primaryMuscleGroup, muscleGroups)} then 0 else 1 end`,
    );
  }
  order.push(asc(exerciseTemplates.isCustom), asc(exerciseTemplates.title));

  return db
    .select()
    .from(exerciseTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...order)
    .limit(limit);
}

/**
 * Batch id → template lookup. Generation post-validation checks every id the
 * model returned; doing that one query per exercise is the N+1 the rules ban.
 */
export async function getTemplatesByIds(ids: string[]): Promise<Map<string, CatalogRow>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select()
    .from(exerciseTemplates)
    .where(inArray(exerciseTemplates.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Title search for the swap-exercise picker. Local LIKE — the API has none. */
export async function searchTemplates(query: string, limit = 25): Promise<CatalogRow[]> {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  // Escape LIKE wildcards so a user typing "%" searches for a literal percent.
  //
  // The escape character is "!", not the conventional backslash, because a
  // backslash cannot be written unambiguously here: MariaDB processes
  // backslash escapes inside string literals, so `escape '\'` reads as an
  // escaped quote and fails to parse, while the doubled form breaks under
  // NO_BACKSLASH_ESCAPES instead. "!" means the same thing in every sql_mode.
  const pattern = `%${trimmed.replace(/[!%_]/g, "!$&")}%`;
  return db
    .select()
    .from(exerciseTemplates)
    .where(sql`${exerciseTemplates.title} like ${pattern} escape '!'`)
    .orderBy(asc(exerciseTemplates.title))
    .limit(limit);
}

/** Distinct equipment categories actually present in the cache (for the form). */
export async function getAvailableEquipment(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ equipment: exerciseTemplates.equipmentCategory })
    .from(exerciseTemplates)
    .orderBy(asc(exerciseTemplates.equipmentCategory));
  return rows.map((r) => r.equipment);
}

/** Single-template lookup, used by the preview UI after an exercise swap. */
export async function getTemplateById(id: string): Promise<CatalogRow | null> {
  const [row] = await db
    .select()
    .from(exerciseTemplates)
    .where(eq(exerciseTemplates.id, id))
    .limit(1);
  return row ?? null;
}
