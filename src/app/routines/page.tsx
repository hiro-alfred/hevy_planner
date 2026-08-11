import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/card";
import { ChipLinks, SearchField } from "@/components/filter-bar";
import { StatTile } from "@/components/stat-tile";
import { describeHevyError } from "@/lib/hevy/errors";
import { getAccountRoutines, type AccountRoutines } from "@/lib/hevy/routines";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";
import { groupByFolder, RoutineGroups } from "./routine-list";

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

type Filter = "all" | "plan" | "other" | "trained";

/**
 * Filtering happens HERE, not in the request.
 *
 * The account's whole routine list has already been fetched — the cap that
 * makes this page necessary also makes the list small — so filtering it again
 * over the network would add round trips to narrow data already in hand.
 */
function applyFilter(account: AccountRoutines, filter: Filter, search: string) {
  const needle = search.trim().toLowerCase();
  return account.routines.filter((routine) => {
    if (filter === "plan" && routine.planId === null) return false;
    if (filter === "other" && routine.planId !== null) return false;
    if (filter === "trained" && routine.sessionCount === 0) return false;
    if (needle === "") return true;
    // Exercise names are searched too: "what did I put curls in?" is the
    // question a routine list is actually asked.
    return (
      routine.title.toLowerCase().includes(needle) ||
      routine.exercises.some((name) => name.toLowerCase().includes(needle))
    );
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <h1 className="ui-h1">In Hevy</h1>
          <p className="ui-sub">
            Every routine in your Hevy account, whether or not this app created it. Open one to see
            its exercises and what you lifted last time. Read-only — nothing here changes anything.
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}

export default async function RoutinesPage({ searchParams }: PageProps<"/routines">) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const filter: Filter =
    query.filter === "plan" || query.filter === "other" || query.filter === "trained"
      ? query.filter
      : "all";

  const client = await getHevyClient();

  if (!client) {
    return (
      <Shell>
        <Card title="No API key" description={NO_KEY_MESSAGE}>
          <Link href="/settings" className="underline">
            Go to settings
          </Link>
        </Card>
      </Shell>
    );
  }

  let account: AccountRoutines | null = null;
  let error: string | null = null;
  try {
    account = await getAccountRoutines(client);
  } catch (caught) {
    error = describeHevyError(caught, "read", "Could not read your routines from Hevy.");
  }

  if (!account) {
    return (
      <Shell>
        {error && <div className="ui-notice ui-notice--warn">{error}</div>}
      </Shell>
    );
  }

  const shown = applyFilter(account, filter, search);
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  const hrefFor = (value: string) => {
    const next = new URLSearchParams(params);
    if (value !== "all") next.set("filter", value);
    const suffix = next.toString();
    return suffix ? `/routines?${suffix}` : "/routines";
  };

  return (
    <Shell>
      <div className="reveal reveal--d1 ui-metrics">
        <StatTile value={account.routines.length} label="Routines in Hevy" />
        <StatTile value={account.linked} label="Belonging to a plan" />
        <StatTile value={account.trained} label="Trained at least once" />
      </div>

      {/* The cap is real, undocumented, and enforced by a 403 partway through a
          sync. Seeing the count beforehand is the only warning available,
          because no endpoint reports the limit. */}
      <div className="ui-notice ui-notice--info">
        Hevy limits how many routines an account may hold and its API cannot delete any of them, so
        every routine here is permanent. Anything not from a plan was either made in the Hevy app or
        left behind by a deleted plan — remove those in the Hevy app if you want them gone.
      </div>

      <div className="ui-toolbar">
        <ChipLinks
          label="Filter routines"
          active={filter}
          hrefFor={hrefFor}
          options={[
            { value: "all", label: "All", count: account.routines.length },
            { value: "plan", label: "From a plan", count: account.linked },
            { value: "other", label: "Made in Hevy", count: account.foreign },
            { value: "trained", label: "Trained", count: account.trained },
          ]}
        />
        <SearchField
          value={search}
          label="Find"
          placeholder="routine or exercise…"
          hidden={filter === "all" ? {} : { filter }}
        />
      </div>

      {shown.length === 0 ? (
        <Card
          title={account.routines.length === 0 ? "No routines" : "Nothing matches"}
          description={
            account.routines.length === 0
              ? "This account has no routines yet."
              : "No routine matches that filter or search."
          }
        >
          <Link href={account.routines.length === 0 ? "/" : "/routines"} className="underline">
            {account.routines.length === 0 ? "Back to your plans" : "Clear the filters"}
          </Link>
        </Card>
      ) : (
        <RoutineGroups groups={groupByFolder(shown)} />
      )}
    </Shell>
  );
}
