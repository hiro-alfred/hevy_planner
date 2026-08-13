import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { buttonClasses } from "@/components/button-styles";
import { Card } from "@/components/card";
import { StatusChip } from "@/components/status-chip";
import { requireIdentity } from "@/lib/auth/guard";
import { getTemplatesByIds } from "@/lib/hevy/catalog";
import { getSyncState } from "@/lib/hevy/sync";
import { getPlan } from "@/lib/plans";
import { getPlanLoadSuggestions } from "@/lib/planner/plan-loads";
import {
  countApplicable,
  countLoadedExercises,
  type LoadSuggestion,
} from "@/lib/planner/suggested-loads";
import { collectTemplateIds, validatePlan } from "@/lib/planner/validate";
import { getHevyKeyStatus } from "@/lib/settings";
import { deletePlanAction, regeneratePlanAction, syncPlanAction } from "../actions";
import { applySuggestedLoadsAction, duplicatePlanAction } from "./edit-actions";
import { PlanPreview } from "./plan-preview";
import { RejectedExercises } from "./rejected-exercises";

export const metadata: Metadata = {
  title: "Plan — Hevy Planner",
};

export const dynamic = "force-dynamic";

function Notice({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  return <div className={`ui-notice ui-notice--${tone}`}>{children}</div>;
}

export default async function PlanPage({ params, searchParams }: PageProps<"/plans/[id]">) {
  // Defence in depth: the proxy already redirects an unauthenticated GET, but
  // a check here means the gate survives a matcher change.
  await requireIdentity();
  const planId = Number((await params).id);
  if (!Number.isInteger(planId)) notFound();

  const row = await getPlan(planId);
  if (!row) notFound();

  const query = await searchParams;
  const justGenerated = typeof query.generated === "string" ? query.generated : null;
  const degraded = query.degraded === "1";

  const plan = row.plan;
  // Re-validate on every render rather than storing the verdict: the catalog can
  // change under a saved plan, and a stale "looks fine" would be worse than none.
  const [catalog, syncState, keyStatus] = await Promise.all([
    plan ? getTemplatesByIds(collectTemplateIds(plan)) : Promise.resolve(new Map()),
    getSyncState(planId, plan),
    getHevyKeyStatus(),
  ]);
  const violations = plan ? validatePlan(plan, row.request, catalog) : [];

  // Computed on every render rather than stored with the plan, for the same
  // reason validation is: the answer depends on the workout history, and a
  // suggestion cached from before this morning's session would be advice about
  // a lifter who no longer exists. Two batched queries, and the catalog map
  // above is handed over so it is not read twice.
  const suggestions: Map<string, LoadSuggestion> = plan
    ? await getPlanLoadSuggestions(plan, catalog)
    : new Map();
  const applicable = plan ? countApplicable(plan, suggestions) : 0;
  const loaded = plan ? countLoadedExercises(plan) : 0;

  // Free-text profile fields the deterministic generator has no way to honour.
  const ignoredByRules = [
    row.request.injuries && "your reported injuries",
    row.request.notes && "your notes",
  ].filter(Boolean) as string[];

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <span className="ui-eyebrow">Plan {String(planId).padStart(3, "0")}</span>
          <h1 className="ui-h1">{plan?.title ?? "Untitled plan"}</h1>
          <p className="text-sm text-ui-faint">
            {row.request.sessionsPerWeek} sessions per week · {row.request.sessionMinutes} min ·{" "}
            {row.request.experience} · {row.request.goal}
          </p>
          {/* A fork keeps its parent's title, so without this a plan and its
              edit are indistinguishable. The link is not guarded against the
              parent having been deleted — derived_from_plan_id has no foreign
              key on purpose — so it may 404, which reads correctly as "the
              plan this came from is gone". */}
          {row.derivedFromPlanId !== null && (
            <p className="text-sm text-ui-faint">
              Edited from{" "}
              <Link href={`/plans/${row.derivedFromPlanId}`} className="underline">
                plan {String(row.derivedFromPlanId).padStart(3, "0")}
              </Link>
              , which is unchanged.
            </p>
          )}
        </div>
        {plan && (
          <StatusChip
            tone={syncState.syncedDays === 0 ? "alert" : syncState.hasPendingChanges ? "warn" : "ok"}
            pulse={syncState.hasPendingChanges}
          >
            {syncState.syncedDays === 0
              ? "Not synced"
              : syncState.hasPendingChanges
                ? "Changes pending"
                : "Synced"}
          </StatusChip>
        )}
      </header>

      {justGenerated === "rules" && !degraded && (
        <Notice tone="info">
          Built with the deterministic generator. Set an LLM provider in the environment for
          coach-written plans.
        </Notice>
      )}
      {degraded && (
        <Notice tone="warn">
          The LLM provider was unreachable, so this plan came from the built-in generator.
        </Notice>
      )}
      {/* The rule-based generator reads none of the free-text profile. Saying so
          matters most for injuries: a plan that silently ignored them while the
          form implied otherwise is worse than one that never asked. */}
      {justGenerated === "rules" && ignoredByRules.length > 0 && (
        <Notice tone="warn">
          The built-in generator cannot read {ignoredByRules.join(" or ")} — only the LLM
          generator acts on {ignoredByRules.length === 1 ? "it" : "them"}. This plan was built
          without {ignoredByRules.length === 1 ? "that" : "those"}.
        </Notice>
      )}
      {violations.length > 0 && (
        <Notice tone="warn">
          <p className="mb-1 font-medium">This plan does not fully match the request:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {violations.map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        </Notice>
      )}

      {plan ? (
        <>
          <Card title="Progression">
            <p className="text-sm leading-relaxed">{plan.progression}</p>
          </Card>

          <PlanPreview plan={plan} planId={planId} suggestions={suggestions} />

          {/* Only when there is history to draw on. A plan whose exercises have
              never been logged says nothing about starting loads, which is the
              same silence the app kept before it could sync workouts at all. */}
          {suggestions.size > 0 && (
            <Card
              title="Starting loads from your history"
              description={
                applicable > 0
                  ? `${applicable} exercise${applicable === 1 ? " has" : "s have"} a load worked out from what you have logged, by the same progression the records page uses. Nothing is in the plan until you put it there.`
                  : "Every load your history supports is already in this plan."
              }
            >
              <div className="flex flex-col gap-4">
                <Notice tone="info">
                  Loads are part of the routine a sync creates, and Hevy&apos;s API cannot delete a
                  routine — so these stay suggestions until you apply them. Check anything that
                  looks wrong with Edit first; a weight that is too heavy costs more than a blank
                  field does.
                </Notice>
                {applicable > 0 && (
                  <ActionButton
                    action={applySuggestedLoadsAction.bind(null, planId)}
                    label={`Use suggested loads (${applicable})`}
                    pendingLabel="Applying…"
                  />
                )}
              </div>
            </Card>
          )}

          <RejectedExercises planId={planId} excluded={row.request.excludedExercises ?? []} />

          <Card
            title="Sync to Hevy"
            description={
              syncState.syncedDays === 0
                ? "Creates one folder and one routine per training day."
                : `${syncState.syncedDays} routines linked. Re-syncing replaces only the days that changed.`
            }
          >
            <div className="flex flex-col gap-4">
              {!keyStatus.configured && (
                <Notice tone="warn">Add a Hevy API key on the settings page to sync.</Notice>
              )}
              {syncState.syncedDays > 0 && !syncState.hasPendingChanges && (
                <Notice tone="info">Hevy is up to date with this plan.</Notice>
              )}
              {loaded > 0 && (
                <Notice tone="info">
                  {loaded} exercise{loaded === 1 ? "" : "s"} carr{loaded === 1 ? "ies" : "y"} a
                  starting weight, and syncing writes {loaded === 1 ? "it" : "them"} into the
                  routine as {loaded === 1 ? "it is" : "they are"}.
                </Notice>
              )}
              {syncState.staleRoutines > 0 && (
                <Notice tone="warn">
                  This plan has fewer days than it used to, so {syncState.staleRoutines} routine
                  {syncState.staleRoutines === 1 ? "" : "s"} in Hevy no longer belong to it.
                  Hevy&apos;s API cannot delete routines — remove them in the Hevy app.
                </Notice>
              )}
              <div className="flex flex-wrap items-start gap-3">
                <ActionButton
                  action={syncPlanAction.bind(null, planId)}
                  label={syncState.syncedDays === 0 ? "Sync to Hevy" : "Re-sync"}
                  pendingLabel="Syncing…"
                  tone="primary"
                />
                <Link href={`/plans/${planId}/edit`} className={buttonClasses("secondary")}>
                  Edit request
                </Link>
                <ActionButton
                  action={duplicatePlanAction.bind(null, planId)}
                  label="Duplicate"
                  pendingLabel="Duplicating…"
                />
                <ActionButton
                  action={regeneratePlanAction.bind(null, planId)}
                  label="Regenerate"
                  pendingLabel="Regenerating…"
                  confirm={
                    syncState.syncedDays > 0
                      ? "Replace this plan's sessions with freshly generated ones? The routines already in Hevy stay linked, so the next sync overwrites them. Use 'Edit request' instead if you want to keep this plan as it is."
                      : "Replace this plan with a freshly generated one?"
                  }
                />
                <ActionButton
                  action={deletePlanAction.bind(null, planId)}
                  label="Delete plan"
                  pendingLabel="Deleting…"
                  tone="danger"
                  confirm="Delete this plan? Routines already in Hevy stay there — the API has no delete."
                />
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Card
          title="Not generated yet"
          description="This plan has a request but no sessions."
        >
          <ActionButton
            action={regeneratePlanAction.bind(null, planId)}
            label="Generate now"
            pendingLabel="Generating…"
            tone="primary"
          />
        </Card>
      )}
    </div>
  );
}
