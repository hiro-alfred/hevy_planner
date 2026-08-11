import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { StatusChip } from "@/components/status-chip";
import { getTemplatesByIds } from "@/lib/hevy/catalog";
import { getSyncState } from "@/lib/hevy/sync";
import { getPlan } from "@/lib/plans";
import { collectTemplateIds, validatePlan } from "@/lib/planner/validate";
import { getHevyKeyStatus } from "@/lib/settings";
import { deletePlanAction, regeneratePlanAction, syncPlanAction } from "../actions";
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

          <PlanPreview plan={plan} planId={planId} />

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
                <ActionButton
                  action={regeneratePlanAction.bind(null, planId)}
                  label="Regenerate"
                  pendingLabel="Regenerating…"
                  confirm="Replace this plan with a freshly generated one?"
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
