import "server-only";
import { generateObject } from "ai";
import { UserFacingError } from "@/lib/errors";
import { getCandidates, getTemplatesByIds, type CatalogRow } from "@/lib/hevy/catalog";
import { expandPlan, llmPlanSchema } from "./llm-plan";
import { buildPrompt, buildRetryPrompt, candidateIndex, SYSTEM_PROMPT } from "./prompt";
import { getLlmConfig, resolveModel } from "./provider";
import { buildRuleBasedPlan, type DayCandidates } from "./rules";
import type { Plan, PlanRequest } from "./schema";
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
  const focus = request.focusMuscleGroups ?? [];

  return Promise.all(
    templates.map(async (template) => ({
      template,
      candidates: await getCandidates({
        equipment: request.equipment,
        // Focus groups widen the CANDIDATE query but deliberately not the day's
        // own muscleGroups, which is what the prompt reports as the day's
        // target. Without this a request to emphasise forearms on a PPL split
        // returns zero forearm candidates — no template lists them — so the
        // emphasis instruction would have nothing to act on. Keeping the two
        // apart means a Legs day can offer a curl without being retitled.
        muscleGroups: [...new Set([...template.muscleGroups, ...focus])],
        // Rejected exercises never reach the model or the rule-based generator.
        // validatePlan re-checks anyway: filtering the pool is what makes the
        // right answer easy, the validator is what makes the wrong one visible.
        excludeIds: request.excludedExercises ?? [],
        limit: CANDIDATES_PER_DAY,
      }),
    })),
  );
}

async function resolveCatalog(plan: Plan): Promise<Map<string, CatalogRow>> {
  return getTemplatesByIds(collectTemplateIds(plan));
}

async function generateWithLlm(
  request: PlanRequest,
  days: DayCandidates[],
): Promise<{ plan: Plan; violations: string[] }> {
  const config = getLlmConfig();
  if (!config) throw new Error("No LLM provider configured");
  const { model, providerOptions } = await resolveModel(config);

  const basePrompt = buildPrompt(request, days);
  // The prompt labels each candidate with a small integer; this maps the
  // model's answers back to catalog rows. Built from the same day list, so the
  // two cannot disagree.
  const byNumber = candidateIndex(days);

  let prompt = basePrompt;
  let last: { plan: Plan; violations: string[] } | null = null;

  // One retry with the violations appended, then stop. A third attempt costs
  // another full generation and rarely fixes what two could not.
  //
  // On DeepSeek this runs as json_object mode with the schema described in a
  // system message, NOT strict json_schema — @ai-sdk/deepseek does not set
  // supportsStructuredOutputs, so the schema is a strong request rather than a
  // guarantee. DeepSeek also documents json_object occasionally returning empty
  // content. Both land in the same place: generateObject throws, and
  // generatePlan's catch falls back to the rule-based generator with a reason.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { object } = await generateObject({
      model,
      // The compact shape, not the internal plan model — see llm-plan.ts. Sets
      // collapse to a count and exercises to an index, which is most of why a
      // generation is not measured in minutes any more.
      schema: llmPlanSchema,
      system: SYSTEM_PROMPT,
      prompt,
      // Ample for the compact shape: a six-day plan lands near 2k. Generous
      // rather than tight because a truncated response is not a shorter plan,
      // it is a parse failure that costs the whole call.
      maxOutputTokens: 6000,
      ...(providerOptions ? { providerOptions } : {}),
    });

    const { plan, unknownNumbers } = expandPlan(object, byNumber);
    const catalog = await resolveCatalog(plan);
    const violations = validatePlan(plan, request, catalog);

    // Reported in the model's own vocabulary. The dropped exercises also make
    // their day too short, which the length check catches — but "day 2 is 18
    // minutes" is not a fixable instruction, and "37 is not on the list" is.
    if (unknownNumbers.length > 0) {
      violations.unshift(
        `These numbers are not on any candidate list and were discarded: ${unknownNumbers.join(", ")}. ` +
          `Use only the numbers shown for each day.`,
      );
    }

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

  // ANY unfillable day is fatal, not just all of them. A single empty day
  // produces a day with no exercises, which sync would push to Hevy as an
  // empty routine — permanently consuming part of a capped, delete-less
  // resource. Better to refuse here with something the user can act on.
  const unfillable = days.filter((day) => day.candidates.length === 0);
  if (unfillable.length > 0) {
    const titles = unfillable.map((day) => day.template.title).join(", ");
    const rejected = request.excludedExercises?.length ?? 0;
    throw new UserFacingError(
      `No exercises in the catalog match ${unfillable.length === days.length ? "this request" : `these training days: ${titles}`}. ` +
        `Widen the equipment selection, or refresh the exercise catalog on the settings page.` +
        // Naming exclusions matters because they are invisible from the form:
        // someone who swapped their way through a small pool would otherwise
        // read this as a catalog fault and go refresh it to no effect.
        (rejected > 0
          ? ` You have also rejected ${rejected} exercise${rejected === 1 ? "" : "s"} on this plan; ` +
            `clearing some of those on the plan page would widen the pool.`
          : ""),
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

  try {
    // getLlmConfig() is inside the try on purpose: a misconfigured provider
    // (key set but an unknown LLM_PROVIDER, or no model for it) throws, and
    // that must fall back to the rules like any other provider failure rather
    // than failing the whole request.
    if (!getLlmConfig()) return await buildFallback();

    const { plan, violations } = await generateWithLlm(request, days);
    return { plan, source: "llm", violations };
  } catch {
    // The provider's own error text is not repeated to the user: it can carry
    // request internals, and there is nothing actionable in it here.
    return buildFallback("The LLM provider could not be used, so the built-in generator was.");
  }
}
