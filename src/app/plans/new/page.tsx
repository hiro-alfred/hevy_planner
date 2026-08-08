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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">New plan</h1>
        <p className="text-sm opacity-70">
          Describe the training you want. Exercises are chosen from your cached Hevy catalog.
        </p>
      </header>

      {!canGenerate && (
        <Card
          title="Exercise catalog is empty"
          description="Plans are built from Hevy's exercise library, which has to be cached locally first."
        >
          <p className="text-sm">
            {keyStatus.configured
              ? "Fetch the catalog on the "
              : "Add your Hevy API key and fetch the catalog on the "}
            <Link href="/settings" className="underline">
              settings page
            </Link>
            , then come back.
          </p>
        </Card>
      )}

      {canGenerate && (
        <Card title="Plan request" description={`${catalog.count} exercises available.`}>
          <PlanForm />
        </Card>
      )}
    </div>
  );
}
