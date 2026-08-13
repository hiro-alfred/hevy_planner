import Link from "next/link";
import { buttonClasses } from "@/components/button-styles";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { StatusChip, type ChipTone } from "@/components/status-chip";
import { requireIdentity } from "@/lib/auth/guard";
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
      <Link href={`/plans/${plan.id}`} className="ui-item">
        <span className="min-w-0 flex-1">
          <span className="ui-item__title block">{plan.title}</span>
          <span className="ui-item__meta block">
            {plan.sessionsPerWeek} days per week · {plan.goal}
            {plan.syncedDays > 0 && ` · ${plan.syncedDays} routines`}
            {/* Forks keep their parent's title, so without this the list reads
                as several identical plans. */}
            {plan.derivedFrom !== null &&
              ` · edited from plan ${String(plan.derivedFrom).padStart(3, "0")}`}
          </span>
        </span>
        <StatusChip tone={status.tone} pulse={plan.syncLabel === "changes_pending"}>
          {status.label}
        </StatusChip>
        <span className="ui-item__arrow" aria-hidden="true">
          ›
        </span>
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
  // Defence in depth: the proxy already redirects an unauthenticated GET, but
  // a check here means the gate survives a matcher change.
  await requireIdentity();
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
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <h1 className="ui-h1">Your plans</h1>
          <p className="ui-sub">
            Build a training plan, review every set, then push it to Hevy as routines.
          </p>
        </div>
        {setupSteps.length === 0 && (
          <Link href="/plans/new" className={buttonClasses("primary")}>
            New plan
          </Link>
        )}
      </header>

      <div className="reveal reveal--d1 ui-metrics">
        <StatTile value={plans.length} label="Plans" />
        <StatTile value={catalog.count} label="Exercises in your library" />
        <StatTile value={syncedRoutines} label="Routines live in Hevy" />
      </div>

      {setupSteps.length > 0 && (
        <Card
          eyebrow="Setup required"
          title="Finish setting up"
          description="Plans are built from your Hevy exercise library, so two things are needed first."
        >
          <ol className="mb-5 flex flex-col gap-2.5">
            {setupSteps.map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span className="ui-mono text-xs text-ui-accent">
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
        <Card title="No plans yet" description="Your generated plans will appear here.">
          {setupSteps.length === 0 && (
            <Link href="/plans/new" className={buttonClasses("primary")}>
              Create your first plan
            </Link>
          )}
        </Card>
      ) : (
        <section className="flex flex-col gap-3.5">
          <div className="ui-sec">
            <h2 className="ui-eyebrow">All plans</h2>
          </div>
          <ul className="ui-list">
            {plans.map((plan, index) => (
              <PlanRow key={plan.id} plan={plan} index={index} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
