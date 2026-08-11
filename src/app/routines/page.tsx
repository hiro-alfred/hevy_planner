import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { describeHevyError } from "@/lib/hevy/errors";
import { getAccountRoutines, type AccountRoutines } from "@/lib/hevy/routines";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";

export const metadata: Metadata = {
  title: "In Hevy — Hevy Planner",
};

export const dynamic = "force-dynamic";

// What is actually in the Hevy account, as opposed to what this app believes it
// put there. READ-ONLY: the page issues GETs and nothing else.
//
// It exists because the app was previously blind to its own output. Routines
// made in the Hevy app were invisible, routines orphaned by a deleted plan were
// invisible, and the undocumented routine cap could only be discovered by a
// create failing with a 403 partway through syncing a plan.
//
// Fetched on navigation rather than cached: it is a handful of requests (the
// routines endpoint caps pageSize at 10, unlike the catalog's 100) and a stale
// answer to "what is in my account" is worse than a slow one.

function RoutineRow({ routine }: { routine: AccountRoutines["routines"][number] }) {
  const owned = routine.planId !== null;

  return (
    <li className="ui-row">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm">{routine.title}</span>
        <span className="ui-item__meta">
          {routine.exerciseCount} exercise{routine.exerciseCount === 1 ? "" : "s"}
          {owned && ` · day ${routine.day} of `}
          {owned && (
            <Link href={`/plans/${routine.planId}`} className="underline">
              {routine.planTitle ?? `plan ${routine.planId}`}
            </Link>
          )}
        </span>
      </span>
      <StatusChip tone={owned ? "ok" : "idle"}>{owned ? "From a plan" : "Not from a plan"}</StatusChip>
    </li>
  );
}

export default async function RoutinesPage() {
  const client = await getHevyClient();

  if (!client) {
    return (
      <div className="ui-shell">
        <header className="reveal ui-hero">
          <h1 className="ui-h1">In Hevy</h1>
        </header>
        <Card title="No API key" description={NO_KEY_MESSAGE}>
          <Link href="/settings" className="underline">
            Go to settings
          </Link>
        </Card>
      </div>
    );
  }

  let account: AccountRoutines | null = null;
  let error: string | null = null;
  try {
    account = await getAccountRoutines(client);
  } catch (caught) {
    error = describeHevyError(caught, "read", "Could not read your routines from Hevy.");
  }

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <h1 className="ui-h1">In Hevy</h1>
          <p className="ui-sub">
            Every routine in your Hevy account, whether or not this app created it. Read-only —
            nothing on this page changes anything.
          </p>
        </div>
      </header>

      {error && <div className="ui-notice ui-notice--warn">{error}</div>}

      {account && (
        <>
          <div className="reveal reveal--d1 ui-metrics">
            <StatTile value={account.routines.length} label="Routines in Hevy" />
            <StatTile value={account.linked} label="Belonging to a plan" />
            <StatTile value={account.foreign} label="Not from a plan" />
          </div>

          {/* The cap is real, undocumented, and enforced by a 403 partway
              through a sync. Seeing the count beforehand is the only warning
              available, because no endpoint reports the limit. */}
          <div className="ui-notice ui-notice--info">
            Hevy limits how many routines an account may hold and its API cannot delete any of
            them, so every routine here is permanent. Anything not from a plan was either made in
            the Hevy app or left behind by a plan that has since been deleted — remove those in the
            Hevy app if you want them gone.
          </div>

          {account.routines.length === 0 ? (
            <Card title="No routines" description="This account has no routines yet.">
              <Link href="/" className="underline">
                Back to your plans
              </Link>
            </Card>
          ) : (
            <Card title="All routines" description={`${account.routines.length} in this account.`}>
              <ul>
                {account.routines.map((routine) => (
                  <RoutineRow key={routine.hevyId} routine={routine} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
