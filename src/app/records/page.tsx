import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { ChipLinks, SearchField } from "@/components/filter-bar";
import { StatTile } from "@/components/stat-tile";
import { getHistoryStatus } from "@/lib/hevy/workout-sync";
import { relativeDay } from "@/lib/records/format";
import { listExerciseRecords } from "@/lib/records/metrics";
import { parseSort, RECORD_SORTS } from "@/lib/records/record-sort";
import { getHevyKeyStatus } from "@/lib/settings";
import { syncHistoryAction } from "./actions";
import { RecordList } from "./record-list";

export const metadata: Metadata = {
  title: "Records — Hevy Planner",
};

export const dynamic = "force-dynamic";

// Every exercise this account has ever logged, with the best it has done.
//
// Served entirely from the LOCAL cache, unlike /routines which calls Hevy on
// every navigation. The difference is cost: routines are a handful of requests,
// while the whole training history is hundreds — and unlike "what is in my
// account", a personal record from ten minutes ago is not meaningfully stale.
// Refreshing is therefore an explicit button, and the page renders fine when
// Hevy is unreachable.

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <h1 className="ui-h1">Records</h1>
          <p className="ui-sub">
            The best you have done on every exercise you have logged, from a local copy of your Hevy
            history. Read-only — nothing here changes anything in Hevy.
          </p>
        </div>
      </header>
      {children}
    </div>
  );
}

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";
  const sort = parseSort(query.sort);

  const [status, keyStatus, records] = await Promise.all([
    getHistoryStatus(),
    getHevyKeyStatus(),
    listExerciseRecords(search, sort),
  ]);

  if (!status.everSynced) {
    return (
      <Shell>
        <Card
          title={keyStatus.configured ? "No history yet" : "No API key"}
          description={
            keyStatus.configured
              ? "Your workout history has never been copied here. The first sync walks the whole history ten workouts at a time, so a long training log takes a few minutes; after that only changes are fetched."
              : "Reading your workout history needs a Hevy API key."
          }
        >
          {keyStatus.configured ? (
            <ActionButton
              action={syncHistoryAction.bind(null, false)}
              label="Sync history"
              pendingLabel="Syncing…"
              tone="primary"
            />
          ) : (
            <Link href="/settings" className="underline">
              Go to settings
            </Link>
          )}
        </Card>
      </Shell>
    );
  }

  const hrefFor = (value: string) => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (value !== "recent") next.set("sort", value);
    const suffix = next.toString();
    return suffix ? `/records?${suffix}` : "/records";
  };

  return (
    <Shell>
      <div className="reveal reveal--d1 ui-metrics">
        <StatTile value={status.workouts} label="Workouts cached" />
        <StatTile value={status.sets} label="Sets logged" />
        <StatTile value={records.length} label="Exercises tracked" />
      </div>

      {/* Sync is a maintenance action, so it sits below the numbers it refreshes
          and above the list it changes — not in the hero, where it would
          compete with the records themselves. */}
      <Card
        title="Sync history"
        description={
          status.lastSyncedAt
            ? `Last updated ${relativeDay(status.lastSyncedAt)}. Only workouts changed since then are fetched.`
            : "Fetches everything logged since the last sync."
        }
      >
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton
            action={syncHistoryAction.bind(null, false)}
            label="Sync new workouts"
            pendingLabel="Syncing…"
            tone="primary"
          />
          {/* Hevy's delta feed is keyed on `updated_at`, and nothing guarantees
              an edit moves it forward. A full re-walk is the only repair if a
              change is ever missed. */}
          <ActionButton
            action={syncHistoryAction.bind(null, true)}
            label="Re-sync everything"
            pendingLabel="Re-syncing…"
            confirm="Re-read your entire Hevy history? This replaces the local copy and can take a few minutes."
          />
        </div>
      </Card>

      <div className="ui-toolbar">
        <ChipLinks
          label="Sort exercises"
          active={sort}
          hrefFor={hrefFor}
          options={RECORD_SORTS.map((option) => ({ value: option.id, label: option.label }))}
        />
        <SearchField
          value={search}
          label="Find an exercise"
          placeholder="bench, squat, curl…"
          hidden={sort === "recent" ? {} : { sort }}
        />
      </div>

      {records.length === 0 ? (
        <Card
          title="Nothing to show"
          description={
            search
              ? `No logged exercise matches "${search}".`
              : "No working sets in the cache yet. Warm-up sets are never counted as records."
          }
        >
          {search && (
            <Link href="/records" className="underline">
              Clear the search
            </Link>
          )}
        </Card>
      ) : (
        <section className="flex flex-col gap-3.5">
          <div className="ui-sec">
            <h2 className="ui-eyebrow">
              {search ? `${records.length} matching "${search}"` : `${records.length} exercises`}
            </h2>
            <span className="ui-card__meta">
              {RECORD_SORTS.find((option) => option.id === sort)?.label} first
            </span>
          </div>
          <RecordList records={records} />
        </section>
      )}
    </Shell>
  );
}
