import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { getCatalogStatus } from "@/lib/hevy/catalog";
import { getHevyKeyStatus } from "@/lib/settings";
import { PlanForm } from "./plan-form";

export const metadata: Metadata = {
  title: "New plan — Hevy Planner",
};

export const dynamic = "force-dynamic";

export default async function NewPlanPage() {
  const [catalog, keyStatus] = await Promise.all([getCatalogStatus(), getHevyKeyStatus()]);
  const canGenerate = catalog.count > 0;

  return (
    <div className="hud-shell max-w-2xl">
      <header className="reveal flex flex-col gap-2">
        <span className="hud-eyebrow">Compose</span>
        <h1 className="hud-h1">New plan</h1>
        <p className="hud-sub">
          Describe the training you want. Exercises are chosen from your cached Hevy catalog.
        </p>
      </header>

      {!canGenerate && (
        <Card
          eyebrow="Blocked"
          title="Exercise catalog is empty"
          description="Plans are built from Hevy's exercise library, which has to be cached locally first."
        >
          <p className="text-sm">
            {keyStatus.configured
              ? "Fetch the catalog on the "
              : "Add your Hevy API key and fetch the catalog on the "}
            <Link href="/settings" className="text-hud-cyan underline underline-offset-4">
              settings page
            </Link>
            , then come back.
          </p>
        </Card>
      )}

      {canGenerate && (
        <Card
          eyebrow="Request"
          title="Plan request"
          description={`${catalog.count} exercises available.`}
        >
          <PlanForm />
        </Card>
      )}
    </div>
  );
}
