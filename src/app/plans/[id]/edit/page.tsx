import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { requireIdentity } from "@/lib/auth/guard";
import { getSyncState } from "@/lib/hevy/sync";
import { getPlan } from "@/lib/plans";
import { PlanForm } from "../../new/plan-form";
import { saveRequestAsNewPlanAction } from "../edit-actions";

export const metadata: Metadata = {
  title: "Edit plan — Hevy Planner",
};

export const dynamic = "force-dynamic";

// Editing a plan's request. Saving here NEVER overwrites the plan being edited:
// it writes a new plan and leaves this one exactly as it is (owner's decision).
//
// The reason is Hevy, not tidiness. A request change re-runs generation and
// replaces every day, and the plan may already own routines in Hevy that no API
// call can delete. Regenerating in place would mean the next sync PUT over
// routines the user had no intention of losing. Forking makes that impossible
// instead of merely unlikely — at the cost, stated below the form, that syncing
// the fork creates a second set of routines rather than replacing the first.

export default async function EditPlanPage({ params }: PageProps<"/plans/[id]/edit">) {
  // Defence in depth: the proxy already redirects an unauthenticated GET, but
  // a check here means the gate survives a matcher change.
  await requireIdentity();
  const planId = Number((await params).id);
  if (!Number.isInteger(planId)) notFound();

  const row = await getPlan(planId);
  if (!row) notFound();

  const syncState = await getSyncState(planId, row.plan);
  const rejected = row.request.excludedExercises?.length ?? 0;

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <span className="ui-eyebrow">Editing plan {String(planId).padStart(3, "0")}</span>
          <h1 className="ui-h1">{row.plan?.title ?? "Untitled plan"}</h1>
          <p className="ui-sub">
            Change anything below and save. This creates a <b>new</b> plan — the one you are
            editing is left exactly as it is.
          </p>
        </div>
        <Link href={`/plans/${planId}`} className="ui-linkbtn">
          Back to the plan
        </Link>
      </header>

      {syncState.syncedDays > 0 && (
        <div className="ui-notice ui-notice--warn">
          This plan already has {syncState.syncedDays} routine
          {syncState.syncedDays === 1 ? "" : "s"} in Hevy, and those stay where they are. Because
          the edit becomes a separate plan, syncing it will <b>create</b> a further{" "}
          {syncState.syncedDays === 1 ? "routine" : "set of routines"} rather than replacing them —
          and Hevy&apos;s API cannot delete the old ones. If you meant to change the routines you
          already have, edit the exercises on the plan page instead and re-sync there.
        </div>
      )}

      {rejected > 0 && (
        <div className="ui-notice ui-notice--info">
          The {rejected} exercise{rejected === 1 ? "" : "s"} you rejected on this plan carry over,
          so the new plan will not suggest {rejected === 1 ? "it" : "them"} either.
        </div>
      )}

      <Card
        title="Plan request"
        description="Everything that produced this plan. Saving regenerates from scratch into a new plan."
      >
        <PlanForm
          action={saveRequestAsNewPlanAction.bind(null, planId)}
          defaults={row.request}
          submitLabel="Save as a new plan"
          pendingLabel="Building the new plan…"
          note="The plan you are editing is not changed."
        />
      </Card>
    </div>
  );
}
