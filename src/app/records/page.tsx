import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { getHistoryStatus } from "@/lib/hevy/workout-sync";
import { formatKg, relativeDay } from "@/lib/records/format";
import { listExerciseRecords, type ExerciseRecordSummary } from "@/lib/records/metrics";
import { getHevyKeyStatus } from "@/lib/settings";
import { syncHistoryAction } from "./actions";

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

function RecordRow({ record }: { record: ExerciseRecordSummary }) {
  // A bodyweight movement has no weight records at all; showing "— kg" for it
  // would read as missing data rather than as the nature of the exercise.
  const detail =
    record.heaviestKg === null
      ? `best ${record.bestReps} reps`
      : `best ${formatKg(record.heaviestKg)} kg · est. 1RM ${formatKg(record.bestE1rmKg)} kg`;

  return (
    <li className="ui-row">
      <span className="flex min-w-0 flex-col gap-1">
        <Link href={`/records/${encodeURIComponent(record.templateId)}`} className="text-sm underline">
          {record.title}
        </Link>
        <span className="ui-item__meta">
          {detail} · {record.sessionCount} session{record.sessionCount === 1 ? "" : "s"} ·{" "}
          {relativeDay(record.lastPerformedAt)}
        </span>
      </span>
    </li>
  );
}

export default async function RecordsPage({ searchParams }: PageProps<"/records">) {
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q : "";

  const [status, keyStatus, records] = await Promise.all([
    getHistoryStatus(),
    getHevyKeyStatus(),
    listExerciseRecords(search),
  ]);

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <h1 className="ui-h1">Records</h1>
          <p className="ui-sub">
            The best you have done on every exercise you have logged, from a local copy of your
            Hevy history. Read-only — nothing on this page changes anything in Hevy.
          </p>
        </div>
      </header>

      {!status.everSynced ? (
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
      ) : (
        <>
          <div className="reveal reveal--d1 ui-metrics">
            <StatTile value={status.workouts} label="Workouts cached" />
            <StatTile value={status.sets} label="Sets logged" />
            <StatTile value={records.length} label="Exercises tracked" />
          </div>

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
              {/* Hevy's delta feed is keyed on `updated_at`, and nothing
                  guarantees an edit moves it forward. A full re-walk is the only
                  repair if a change is ever missed. */}
              <ActionButton
                action={syncHistoryAction.bind(null, true)}
                label="Re-sync everything"
                pendingLabel="Re-syncing…"
                confirm="Re-read your entire Hevy history? This replaces the local copy and can take a few minutes."
              />
            </div>
          </Card>

          <Card
            title="Exercises"
            description={
              search
                ? `${records.length} matching "${search}", most recently trained first.`
                : `${records.length} exercises, most recently trained first.`
            }
          >
            {/* A GET form, so a search is a plain URL the browser can bookmark
                and the back button can undo — no client-side state involved. */}
            <form method="get" className="mb-4 flex flex-wrap items-center gap-3">
              <label htmlFor="q" className="ui-label">
                Find an exercise
              </label>
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={search}
                placeholder="bench, squat, curl…"
                className="ui-field max-w-xs"
              />
            </form>

            {records.length === 0 ? (
              <p className="ui-sub text-sm">
                {search
                  ? "No logged exercise matches that."
                  : "No working sets in the cache yet. Warm-up sets are never counted as records."}
              </p>
            ) : (
              <ul>
                {records.map((record) => (
                  <RecordRow key={record.templateId} record={record} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
