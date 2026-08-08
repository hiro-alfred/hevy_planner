import Link from "next/link";
import { buttonClasses } from "@/components/button-styles";
import { Card } from "@/components/card";
import { PointerGlow } from "@/components/pointer-glow";
import { StatTile } from "@/components/stat-tile";
import { StatusChip, type ChipTone } from "@/components/status-chip";
import { getCatalogStatus } from "@/lib/hevy/catalog";
import { listPlans, type PlanListItem } from "@/lib/plans";
import { getHevyKeyStatus } from "@/lib/settings";

export const dynamic = "force-dynamic";

const SYNC_STATUS: Record<PlanListItem["syncLabel"], { label: string; tone: ChipTone }> = {
  draft: { label: "Draft", tone: "idle" },
  not_synced: { label: "Not synced", tone: "alert" },
  changes_pending: { label: "Changes pending", tone: "warn" },
  synced: { label: "Synced", tone: "ok" },
};

function PlanRow({ plan, index }: { plan: PlanListItem; index: number }) {
  const status = SYNC_STATUS[plan.syncLabel];
  // Stagger runs out at six rows; past that everything reveals together, which
  // is better than a long list trickling in for a second and a half.
  const stagger = index < 6 ? ` reveal--d${index + 1}` : "";

  return (
    <li className={`reveal${stagger}`}>
      <Link href={`/plans/${plan.id}`} className="hud-row">
        <span className="flex flex-col gap-1">
          <span className="font-medium tracking-wide uppercase">{plan.title}</span>
          <span className="hud-mono text-xs text-hud-dim">
            {plan.sessionsPerWeek} days/wk · {plan.goal}
            {plan.syncedDays > 0 && ` · ${plan.syncedDays} routines`}
          </span>
        </span>
        <StatusChip tone={status.tone} pulse={plan.syncLabel === "changes_pending"}>
          {status.label}
        </StatusChip>
      </Link>
    </li>
  );
}

/**
 * Dashboard: the plans you have, and whatever setup step is still missing.
 *
 * All three reads happen together — the page is useless without any of them,
 * and issuing them in sequence would just add round trips.
 */
export default async function Home() {
  const [plans, catalog, keyStatus] = await Promise.all([
    listPlans(),
    getCatalogStatus(),
    getHevyKeyStatus(),
  ]);

  const setupSteps = [
    !keyStatus.configured && "Add your Hevy API key",
    catalog.count === 0 && "Fetch the exercise catalog",
  ].filter(Boolean) as string[];

  // Derived from the list already in hand — no extra query per plan.
  const syncedRoutines = plans.reduce((total, plan) => total + plan.syncedDays, 0);

  return (
    <div className="hud-shell max-w-3xl">
      <header className="reveal flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="hud-eyebrow">Training system</span>
          <h1 className="hud-h1">Your plans</h1>
          <p className="hud-sub">Build a training plan and push it to Hevy as routines.</p>
        </div>
        {setupSteps.length === 0 && (
          <Link href="/plans/new" className={buttonClasses("primary")}>
            New plan
          </Link>
        )}
      </header>

      <div className="reveal reveal--d1 grid grid-cols-3 gap-3">
        <StatTile value={plans.length} label="Plans" />
        <StatTile value={catalog.count} label="Exercises" />
        <StatTile value={syncedRoutines} label="Routines live" />
      </div>

      {setupSteps.length > 0 && (
        <Card
          eyebrow="Setup required"
          title="Finish setting up"
          description="Plans are built from your Hevy exercise library, so two things are needed first."
        >
          <ol className="mb-5 flex flex-col gap-2">
            {setupSteps.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span className="hud-mono text-xs text-hud-cyan">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <Link href="/settings" className={buttonClasses("primary")}>
            Go to settings
          </Link>
        </Card>
      )}

      {plans.length === 0 ? (
        <Card
          eyebrow="Empty"
          title="No plans yet"
          description="Your generated plans will appear here."
        >
          {setupSteps.length === 0 && (
            <Link href="/plans/new" className={buttonClasses("primary")}>
              Create your first plan
            </Link>
          )}
        </Card>
      ) : (
        <section className="hud-panel">
          <PointerGlow />
          <span className="hud-panel__scan" aria-hidden="true" />
          <ul className="divide-y divide-hud-line-soft">
            {plans.map((plan, index) => (
              <PlanRow key={plan.id} plan={plan} index={index} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
