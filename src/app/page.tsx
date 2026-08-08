import Link from "next/link";
import { buttonClasses } from "@/components/button-styles";
import { Card } from "@/components/card";
import { getCatalogStatus } from "@/lib/hevy/catalog";
import { listPlans, type PlanListItem } from "@/lib/plans";
import { getHevyKeyStatus } from "@/lib/settings";

export const dynamic = "force-dynamic";

const SYNC_LABEL: Record<PlanListItem["syncLabel"], string> = {
  draft: "Not generated",
  not_synced: "Not synced",
  changes_pending: "Changes to sync",
  synced: "Synced",
};

function PlanRow({ plan }: { plan: PlanListItem }) {
  return (
    <li>
      <Link
        href={`/plans/${plan.id}`}
        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:bg-black/[0.03] dark:hover:bg-white/[0.05]"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">{plan.title}</span>
          <span className="text-xs opacity-60">
            {plan.sessionsPerWeek} days/week · {plan.goal}
          </span>
        </span>
        <span className="text-xs opacity-70">
          {SYNC_LABEL[plan.syncLabel]}
          {plan.syncedDays > 0 && ` · ${plan.syncedDays} routines`}
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
  const [plans, catalog, keyStatus] = await Promise.all([
    listPlans(),
    getCatalogStatus(),
    getHevyKeyStatus(),
  ]);

  const setupSteps = [
    !keyStatus.configured && "Add your Hevy API key",
    catalog.count === 0 && "Fetch the exercise catalog",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Your plans</h1>
          <p className="text-sm opacity-70">
            Build a training plan and push it to Hevy as routines.
          </p>
        </div>
        {setupSteps.length === 0 && (
          <Link href="/plans/new" className={buttonClasses("primary")}>
            New plan
          </Link>
        )}
      </header>

      {setupSteps.length > 0 && (
        <Card
          title="Finish setting up"
          description="Plans are built from your Hevy exercise library, so two things are needed first."
        >
          <ol className="mb-4 list-inside list-decimal space-y-1 text-sm">
            {setupSteps.map((step) => (
              <li key={step}>{step}</li>
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
        <ul className="divide-y divide-black/5 overflow-hidden rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </ul>
      )}
    </div>
  );
}
