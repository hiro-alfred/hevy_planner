import type { Metadata } from "next";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { StatusChip } from "@/components/status-chip";
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

// Label/value pair. Laid out inline rather than as a stacked definition list —
// each value is a few words, and stacking them would spread three facts over
// six lines.
function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="text-sm text-ui-faint">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  // Only the MASKED status crosses into the render tree — getHevyApiKey (the
  // raw value) is never called from a component.
  const [keyStatus, catalog] = await Promise.all([getHevyKeyStatus(), getCatalogStatus()]);

  return (
    <div className="ui-shell">
      <header className="reveal flex flex-col gap-2.5">
        <h1 className="ui-h1">Settings</h1>
        <p className="ui-sub">
          Connect your Hevy account and keep the local exercise catalog fresh.
        </p>
      </header>

      <Card
        title="Hevy connection"
        description="A Hevy Pro developer key from hevy.com/settings?developer."
      >
        <div className="flex flex-col gap-5">
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Readout label="Status">
              {keyStatus.configured ? (
                <StatusChip tone="ok">Set · ····{keyStatus.last4}</StatusChip>
              ) : keyStatus.undecryptable ? (
                // Not the same as "no key": one is stored, but the encryption
                // key that wrote it is gone or changed. Saying "Not
                // configured" would send the user hunting for a missing key.
                <StatusChip tone="warn">Unreadable · key mismatch</StatusChip>
              ) : (
                <StatusChip tone="idle">Not configured</StatusChip>
              )}
            </Readout>
            <Readout label="Source">
              {keyStatus.fromEnv ? "HEVY_API_KEY env var" : "This settings page"}
            </Readout>
            {keyStatus.updatedAt && (
              <Readout label="Updated">{formatWhen(keyStatus.updatedAt)}</Readout>
            )}
          </dl>

          {keyStatus.undecryptable && (
            <p className="ui-notice ui-notice--warn">
              A key is stored but SETTINGS_ENCRYPTION_KEY no longer matches the one that
              encrypted it. Saving a new key overwrites it.
            </p>
          )}

          <HevyKeyForm />

          <div className="flex flex-wrap items-start gap-3 border-t border-ui-line pt-5">
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
        <div className="flex flex-col gap-5">
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            <Readout label="Cached">
              <span className="ui-mono">{catalog.count}</span> exercises
            </Readout>
            <Readout label="Refreshed">{formatWhen(catalog.lastRefreshedAt)}</Readout>
          </dl>
          <ActionButton
            action={refreshCatalogAction}
            label={catalog.count === 0 ? "Fetch catalog" : "Refresh catalog"}
            pendingLabel="Fetching from Hevy…"
            tone={catalog.count === 0 ? "primary" : "secondary"}
          />
          {catalog.count === 0 && (
            <p className="ui-sub">
              Plan generation needs this cache. Fetch it once after saving your key.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
