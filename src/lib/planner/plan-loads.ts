import "server-only";
import { getTemplatesByIds, type CatalogRow } from "@/lib/hevy/catalog";
import { getRecentSessions } from "@/lib/records/last-session";
import type { Plan } from "./schema";
import { suggestLoads, type LoadSuggestion } from "./suggested-loads";
import { collectTemplateIds } from "./validate";

// The database half of suggested loads: fetch the history, hand it to the pure
// policy in suggested-loads.ts.
//
// TWO queries for a whole plan, whatever its size. A seven-day plan holds up to
// fifty-six exercises, so the per-exercise shape — getExerciseRecords(id) in a
// loop, which is the obvious way to reach the progression engine — would be
// fifty-six round trips per page render: the N+1 the project rules ban outright.
// getRecentSessions takes the whole id list and getTemplatesByIds already did.

/**
 * Suggested starting loads for a plan, keyed by day and exercise position.
 *
 * `catalog` is optional purely so the plan page can hand over the map it has
 * already fetched for validation rather than reading the same rows twice.
 */
export async function getPlanLoadSuggestions(
  plan: Plan,
  catalog?: Map<string, CatalogRow>,
): Promise<Map<string, LoadSuggestion>> {
  const templateIds = collectTemplateIds(plan);

  const [sessions, templates] = await Promise.all([
    getRecentSessions(templateIds),
    catalog ? Promise.resolve(catalog) : getTemplatesByIds(templateIds),
  ]);

  return suggestLoads(plan, sessions, templates);
}
