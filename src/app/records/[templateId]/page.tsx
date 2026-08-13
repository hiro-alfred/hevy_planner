import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { requireIdentity } from "@/lib/auth/guard";
import { getTemplateById } from "@/lib/hevy/catalog";
import { formatDay, formatKg, relativeDay } from "@/lib/records/format";
import { getExerciseRecords, type RecordSet } from "@/lib/records/metrics";
import { recommendProgression } from "@/lib/records/progression";
import { trendSeries } from "@/lib/records/trend";
import { RecommendationCard } from "./recommendation-card";
import { SessionList } from "./session-list";
import { TrendChart } from "./trend-chart";

export const metadata: Metadata = {
  title: "Exercise records — Hevy Planner",
};

export const dynamic = "force-dynamic";

// One exercise: what the best sets were, where they are heading, and what to do
// next.
//
// All of it comes from the same cached history and the same single query. The
// catalog row is looked up too, but only to sharpen the recommendation
// (equipment sets the load increment, type says whether weight is load or
// assistance) — the page still works without it, because history can reference
// a custom exercise the catalog no longer has.

// Ten sessions is enough to see a trend without turning the page into a log.
const HISTORY_LIMIT = 10;

/** One personal record as a label/value pair; absent records render nothing. */
function RecordEntry({ label, record }: { label: string; record: RecordSet | null }) {
  if (record === null) return null;
  const performed =
    record.weightKg === null
      ? `${record.reps} reps`
      : `${formatKg(record.weightKg)} kg × ${record.reps}`;

  return (
    <div className="ui-kv__row">
      <span className="ui-kv__label">{label}</span>
      <span className="ui-kv__value">
        {performed}
        <span className="ui-kv__when">{relativeDay(record.performedAt)}</span>
      </span>
    </div>
  );
}

export default async function ExerciseRecordsPage({ params }: PageProps<"/records/[templateId]">) {
  // Defence in depth: the proxy already redirects an unauthenticated GET, but
  // a check here means the gate survives a matcher change.
  await requireIdentity();
  const templateId = decodeURIComponent((await params).templateId);

  const records = await getExerciseRecords(templateId);
  // No logged sets is a 404 rather than an empty page: this route is only ever
  // reached from the index, which lists exercises that have history.
  if (!records) notFound();

  const template = await getTemplateById(templateId);
  const recommendation = recommendProgression({
    sessions: records.sessions,
    exerciseType: template?.type ?? "weight_reps",
    equipmentCategory: template?.equipmentCategory ?? "barbell",
  });

  // How many working sets the last session held — the recommendation prescribes
  // reps and load, and repeating the usual set count is the sane default.
  const setCount = records.sessions[0]?.sets.length ?? 0;
  const totalSets = records.sessions.reduce((sum, session) => sum + session.sets.length, 0);
  const recent = records.sessions.slice(0, HISTORY_LIMIT);
  const trend = trendSeries(records.sessions);

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="ui-eyebrow">
            <Link href="/records" className="underline">
              Records
            </Link>
          </span>
          <h1 className="ui-h1">{records.title}</h1>
          <p className="ui-sub">
            {records.sessions.length} session{records.sessions.length === 1 ? "" : "s"} logged · last
            trained {relativeDay(records.sessions[0]!.startTime)}
          </p>
        </div>
        {template && (
          <StatusChip tone="idle">
            {template.equipmentCategory} · {template.primaryMuscleGroup}
          </StatusChip>
        )}
      </header>

      {!template && (
        <div className="ui-notice ui-notice--info">
          This exercise is not in the cached catalog — it may be a custom exercise that has since
          been deleted. The records below are unaffected; the recommendation assumes a barbell.
        </div>
      )}

      {/* .ui-metrics is a three-column row by design, and the headline numbers
          differ by exercise: a pull-up has no 1RM and no heaviest weight, so
          showing those tiles would put two zeros where the records should be —
          and a plank, with neither weight nor reps, would show three. */}
      <div className="reveal reveal--d1 ui-metrics">
        {records.heaviest !== null ? (
          <>
            <StatTile value={Math.round(records.bestE1rm?.value ?? 0)} label="Est. 1RM (kg)" />
            <StatTile value={Math.round(records.heaviest.value)} label="Heaviest (kg)" />
          </>
        ) : (
          <>
            {records.bestReps !== null && (
              <StatTile value={records.bestReps.value} label="Most reps" />
            )}
            <StatTile value={totalSets} label="Sets logged" />
          </>
        )}
        <StatTile value={records.sessions.length} label="Sessions" />
      </div>

      <RecommendationCard recommendation={recommendation} setCount={setCount} />

      {/* Two sessions is the minimum that can show a direction; below that the
          card is omitted rather than drawn as a single lonely dot. */}
      {trend.points.length >= 2 && (
        <Card
          title={trend.metric === "e1rm" ? "Estimated 1RM over time" : "Best set over time"}
          eyebrow="Trend"
          description={
            trend.metric === "e1rm"
              ? "The best estimated one-rep max of each session, spaced by when you actually trained — so a gap in the line is a gap in your training."
              : "The best set of each session by reps, spaced by when you actually trained. This exercise has no logged weight, so reps are the measure."
          }
        >
          <TrendChart points={trend.points} metric={trend.metric} />
        </Card>
      )}

      {/* Omitted entirely for a timed or measured exercise: every record here is
          derived from weight or reps, so the card would otherwise render as a
          heading over nothing. */}
      {records.bestReps !== null && (
        <Card title="Personal records" description="Working sets only — warm-ups are never counted.">
          <div className="ui-kv">
            <RecordEntry label="Best estimated 1RM" record={records.bestE1rm} />
            <RecordEntry label="Heaviest weight" record={records.heaviest} />
            <RecordEntry label="Best single-set volume" record={records.bestVolume} />
            <RecordEntry label="Most reps in a set" record={records.bestReps} />
          </div>
        </Card>
      )}

      {records.repMaxes.length > 0 && (
        <Card
          title="Rep maxes"
          description="The most weight moved for at least that many reps, so a heavy set of 8 also counts as a 5-rep result."
        >
          <div className="ui-kv">
            {records.repMaxes.map((entry) => (
              <div key={entry.reps} className="ui-kv__row">
                <span className="ui-kv__label">
                  {entry.reps} rep{entry.reps === 1 ? "" : "s"}
                </span>
                <span className="ui-kv__value">
                  {formatKg(entry.weightKg)} kg
                  <span className="ui-kv__when">{formatDay(entry.performedAt)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card
        title="Recent sessions"
        // The highlighting note is dropped when nothing carries weight: there
        // is no heaviest set of a set of planks.
        description={
          [
            records.sessions.length > HISTORY_LIMIT
              ? `The last ${HISTORY_LIMIT} of ${records.sessions.length}, newest first.`
              : "Newest first.",
            records.heaviest !== null && "The heaviest set of each session is highlighted.",
          ]
            .filter(Boolean)
            .join(" ")
        }
      >
        <SessionList sessions={recent} prAt={records.bestE1rm?.performedAt ?? null} />
      </Card>
    </div>
  );
}
