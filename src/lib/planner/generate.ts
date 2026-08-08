import "server-only";
import { generateObject } from "ai";
import { UserFacingError } from "@/lib/errors";
import { getCandidates, getTemplatesByIds, type CatalogRow } from "@/lib/hevy/catalog";
import { buildPrompt, buildRetryPrompt, SYSTEM_PROMPT } from "./prompt";
import { getLlmConfig, resolveModel } from "./provider";
import { buildRuleBasedPlan, type DayCandidates } from "./rules";
import { planSchema, type Plan, type PlanRequest } from "./schema";
import { buildTrainingDays } from "./split";
import { collectTemplateIds, validatePlan } from "./validate";

// Stage 3 of the pipeline (knowledge/decisions/plan-pipeline.md): request +
// catalog candidates -> plan.
//
// Two generators sit behind one entry point. The LLM writes better plans; the
// rule-based generator always works. Whichever runs, the result is validated
// against the same rules, and a plan that fails validation is surfaced with its
// problems rather than silently accepted or silently swapped.

/** Per-day candidate cap. Enough choice for a session, small enough to prompt. */
const CANDIDATES_PER_DAY = 40;

export type PlanSource = "llm" | "rules";

export interface GenerateResult {
  plan: Plan;
  source: PlanSource;
  /** Validation problems that survived the retry. Empty means a clean plan. */
  violations: string[];
  /** Set when the LLM was configured but could not be used. */
  fallbackReason?: string;
}

/**
 * Fetches candidates one query per training day.
 *
 * Deliberately not one query for the whole plan: getCandidates returns a single
 * flat ordered list, so a plan-wide query can let `limit` starve a muscle group
 * (see knowledge/systems/catalog-service.md). A handful of queries per plan is
 * not the N+1 pattern the rules ban — that would be a query per exercise.
 */
async function loadDayCandidates(request: PlanRequest): Promise<DayCandidates[]> {
  const templates = buildTrainingDays(request);
  return Promise.all(
    templates.map(async (template) => ({
      template,
      candidates: await getCandidates({
        equipment: request.equipment,
        muscleGroups: template.muscleGroups,
        limit: CANDIDATES_PER_DAY,
      }),
    })),
  );
}

async function resolveCatalog(plan: Plan): Promise<Map<string, CatalogRow>> {
  return getTemplatesByIds(collectTemplateIds(plan));
}

/**
 * Names in a generated plan are whatever the model wrote; the catalog is the
 * authority. Re-labelling here keeps the preview honest even when the model
 * paraphrases an exercise title.
 */
function relabel(plan: Plan, catalog: Map<string, CatalogRow>): Plan {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((exercise) => ({
        ...exercise,
        name: catalog.get(exercise.exerciseTemplateId)?.title ?? exercise.name,
      })),
    })),
  };
}

async function generateWithLlm(
  request: PlanRequest,
  days: DayCandidates[],
): Promise<{ plan: Plan; violations: string[] }> {
  const config = getLlmConfig();
  if (!config) throw new Error("No LLM provider configured");
  const model = await resolveModel(config);

  const basePrompt = buildPrompt(request, days);
  let prompt = basePrompt;
  let last: { plan: Plan; violations: string[] } | null = null;

  // One retry with the violations appended, then stop. A third attempt costs
  // another 30-60s and rarely fixes what two could not.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { object } = await generateObject({
      model,
      schema: planSchema,
      system: SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 16000,
    });

    const catalog = await resolveCatalog(object);
    const plan = relabel(object, catalog);
    const violations = validatePlan(plan, request, catalog);
    if (violations.length === 0) return { plan, violations };

    last = { plan, violations };
    prompt = buildRetryPrompt(basePrompt, violations);
  }

  // Surface the failed attempt with its problems — never silently degrade.
  return last!;
}

/**
 * Generates a plan for a request.
 *
 * Never throws for want of an LLM: with no provider configured, or when the
 * provider call fails, the deterministic generator produces the plan and the
 * reason is reported alongside it.
 */
export async function generatePlan(request: PlanRequest): Promise<GenerateResult> {
  const days = await loadDayCandidates(request);

  if (days.every((day) => day.candidates.length === 0)) {
    throw new UserFacingError(
      "No exercises match this request. Refresh the exercise catalog on the settings page, or widen the equipment selection.",
    );
  }

  const buildFallback = async (fallbackReason?: string): Promise<GenerateResult> => {
    const plan = buildRuleBasedPlan(request, days);
    const catalog = await resolveCatalog(plan);
    return {
      plan,
      source: "rules",
      violations: validatePlan(plan, request, catalog),
      fallbackReason,
    };
  };

  if (!getLlmConfig()) return buildFallback();

  try {
    const { plan, violations } = await generateWithLlm(request, days);
    return { plan, source: "llm", violations };
  } catch {
    // The provider's own error text is not repeated to the user: it can carry
    // request internals, and there is nothing actionable in it here.
    return buildFallback("The LLM provider was unreachable, so the built-in generator was used.");
  }
}
