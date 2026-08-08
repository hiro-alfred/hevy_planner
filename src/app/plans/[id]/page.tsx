import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { getTemplatesByIds } from "@/lib/hevy/catalog";
import { getSyncState } from "@/lib/hevy/sync";
import { getPlan } from "@/lib/plans";
import { collectTemplateIds, validatePlan } from "@/lib/planner/validate";
import { getHevyKeyStatus } from "@/lib/settings";
import { deletePlanAction, regeneratePlanAction, syncPlanAction } from "../actions";
import { PlanPreview } from "./plan-preview";

export const metadata: Metadata = {
  title: "Plan — Hevy Planner",
};

export const dynamic = "force-dynamic";

function Notice({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) {
  const classes =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
      : "border-black/10 bg-black/[0.03] dark:border-white/15 dark:bg-white/[0.04]";
  return <div className={`rounded-md border px-3 py-2 text-sm ${classes}`}>{children}</div>;
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{plan?.title ?? "Untitled plan"}</h1>
        <p className="text-sm opacity-70">
          {row.request.sessionsPerWeek} sessions/week · {row.request.sessionMinutes} min ·{" "}
          {row.request.experience} · {row.request.goal}
        </p>
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

          <PlanPreview plan={plan} />

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
        <Card title="Not generated yet" description="This plan has a request but no sessions.">
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
