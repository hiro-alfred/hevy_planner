import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { getCatalogStatus } from "@/lib/hevy/catalog";
import { getHevyKeyStatus } from "@/lib/settings";
import { clearHevyKeyAction, refreshCatalogAction, testConnectionAction } from "./actions";
import { HevyKeyForm } from "./hevy-key-form";

export const metadata: Metadata = {
  title: "Settings — Hevy Planner",
};

// Settings reads live DB state on every request; nothing here may be cached.
export const dynamic = "force-dynamic";

function formatWhen(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

export default async function SettingsPage() {
  // Only the MASKED status crosses into the render tree — getHevyApiKey (the
  // raw value) is never called from a component.
  const [keyStatus, catalog] = await Promise.all([getHevyKeyStatus(), getCatalogStatus()]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm opacity-70">
          Connect your Hevy account and keep the local exercise catalog fresh.
        </p>
      </header>

      <Card
        title="Hevy connection"
        description="A Hevy Pro developer key from hevy.com/settings?developer."
      >
        <div className="flex flex-col gap-4">
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <div className="flex items-center gap-2">
              <dt className="opacity-70">Status</dt>
              <dd className="font-medium">
                {keyStatus.configured ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Set ✓ · ····{keyStatus.last4}
                  </span>
                ) : keyStatus.undecryptable ? (
                  // Not the same as "no key": one is stored, but the encryption
                  // key that wrote it is gone or changed. Saying "Not
                  // configured" would send the user hunting for a missing key.
                  <span className="text-amber-600 dark:text-amber-400">
                    Stored but unreadable — SETTINGS_ENCRYPTION_KEY does not match
                  </span>
                ) : (
                  <span className="opacity-70">Not configured</span>
                )}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="opacity-70">Source</dt>
              <dd>{keyStatus.fromEnv ? "HEVY_API_KEY env var" : "This settings page"}</dd>
            </div>
            {keyStatus.updatedAt && (
              <div className="flex items-center gap-2">
                <dt className="opacity-70">Updated</dt>
                <dd>{formatWhen(keyStatus.updatedAt)}</dd>
              </div>
            )}
          </dl>

          <HevyKeyForm />

          <div className="flex flex-wrap items-start gap-3 border-t border-black/10 pt-4 dark:border-white/15">
            <ActionButton
              action={testConnectionAction}
              label="Test connection"
              pendingLabel="Testing…"
            />
            {keyStatus.configured && !keyStatus.fromEnv && (
              <ActionButton
                action={clearHevyKeyAction}
                label="Remove stored key"
                pendingLabel="Removing…"
                tone="danger"
                confirm="Remove the stored Hevy API key?"
              />
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Exercise catalog"
        description="Hevy has no exercise search endpoint, so the whole library is cached locally and used to build plans."
      >
        <div className="flex flex-col gap-4">
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div className="flex items-center gap-2">
              <dt className="opacity-70">Cached exercises</dt>
              <dd className="font-medium">{catalog.count}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="opacity-70">Last refreshed</dt>
              <dd>{formatWhen(catalog.lastRefreshedAt)}</dd>
            </div>
          </dl>
          <ActionButton
            action={refreshCatalogAction}
            label={catalog.count === 0 ? "Fetch catalog" : "Refresh catalog"}
            pendingLabel="Fetching from Hevy…"
            tone={catalog.count === 0 ? "primary" : "secondary"}
          />
          {catalog.count === 0 && (
            <p className="text-sm opacity-70">
              Plan generation needs this cache. Fetch it once after saving your key.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
