import type { PlanRequest } from "./schema";

// Generation service: AI SDK `streamObject` against planSchema
// (knowledge/decisions/plan-pipeline.md, stage 3). Prompt = coaching system
// prompt + request params + candidate list ("id — name (muscle, equipment)"),
// hard rule: only listed exercise_template_ids.
//
// Post-validation (before accepting a result):
//   1. every exerciseTemplateId resolves in the catalog cache
//   2. days.length === request.sessionsPerWeek
//   3. session length plausible: Σ sets × (~45s + restSeconds) within ±20%
//      of request.sessionMinutes
// One retry with the specific violations appended; a second failure surfaces
// the raw attempt to the user — never silently degrade.
//
// Provider selection comes from LLM_PROVIDER / LLM_API_KEY via the AI SDK;
// the provider package is added when the owner picks one.

export async function generatePlan(_request: PlanRequest): Promise<never> {
  throw new Error("Not implemented: plan generation");
}
