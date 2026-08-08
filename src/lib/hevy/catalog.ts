import type { HevyClient } from "./client";

// Catalog service: pages the ENTIRE exercise_templates library into the
// exercise_templates table (the API has no search — local cache is the only way
// to resolve names/filters), then serves candidate lists for generation.
// See knowledge/decisions/plan-pipeline.md, stage 2.

export async function refreshCatalog(_client: HevyClient): Promise<number> {
  // TODO: walk pages (pageSize 100) until page_count, upsert rows, stamp
  // fetchedAt; single transaction so a failed refresh never truncates the cache.
  throw new Error("Not implemented: catalog refresh");
}

export interface CandidateFilter {
  equipment: string[];
  muscleGroups: string[];
}

export async function getCandidates(_filter: CandidateFilter) {
  // TODO: WHERE equipment_category IN (...) AND primary_muscle_group IN (...);
  // target ~100–150 rows for the generation prompt.
  throw new Error("Not implemented: candidate filtering");
}
