import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { getTemplateById } from "@/lib/hevy/catalog";
import { formatDay, formatKg, formatSets, relativeDay } from "@/lib/records/format";
import { getExerciseRecords, type RecordSet } from "@/lib/records/metrics";
import { recommendProgression } from "@/lib/records/progression";
import { RecommendationCard } from "./recommendation-card";

export const metadata: Metadata = {
  title: "Exercise records — Hevy Planner",
};

export const dynamic = "force-dynamic";

// One exercise: what the best sets were, and what to do next.
//
// Both halves come from the same cached history. The catalog row is looked up
// too, but only to sharpen the recommendation (equipment sets the load
// increment, type says whether weight is load or assistance) — the page still
// works without it, because history can reference a custom exercise the catalog
// no longer has.

// Ten sessions is enough to see a trend without turning the page into a log.
const HISTORY_LIMIT = 10;

function RecordLine({ label, record }: { label: string; record: RecordSet | null }) {
  if (record === null) return null;
  const performed =
    record.weightKg === null
      ? `${record.reps} reps`
      : `${formatKg(record.weightKg)} kg × ${record.reps}`;

  return (
    <li className="ui-row">
      <span className="text-sm">{label}</span>
      <span className="ui-item__meta">
        {performed} · {formatDay(record.performedAt)}
      </span>
    </li>
  );
}

export default async function ExerciseRecordsPage({ params }: PageProps<"/records/[templateId]">) {
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

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <span className="ui-eyebrow">
            <Link href="/records" className="underline">
              Records
            </Link>
          </span>
          <h1 className="ui-h1">{records.title}</h1>
          <p className="ui-sub">
            {records.sessions.length} session{records.sessions.length === 1 ? "" : "s"} logged ·
            last trained {relativeDay(records.sessions[0]!.startTime)}
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
          showing those tiles would put two zeros where the records should be. */}
      <div className="reveal reveal--d1 ui-metrics">
        {records.heaviest === null ? (
          <>
            <StatTile value={records.bestReps?.value ?? 0} label="Most reps" />
            <StatTile value={totalSets} label="Sets logged" />
          </>
        ) : (
          <>
            <StatTile value={Math.round(records.bestE1rm?.value ?? 0)} label="Est. 1RM (kg)" />
            <StatTile value={Math.round(records.heaviest.value)} label="Heaviest (kg)" />
          </>
        )}
        <StatTile value={records.sessions.length} label="Sessions" />
      </div>

      <RecommendationCard recommendation={recommendation} setCount={setCount} />

      <Card
        title="Personal records"
        description="Working sets only — warm-ups are never counted."
      >
        <ul>
          <RecordLine label="Best estimated 1RM" record={records.bestE1rm} />
          <RecordLine label="Heaviest weight" record={records.heaviest} />
          <RecordLine label="Best single-set volume" record={records.bestVolume} />
          <RecordLine label="Most reps in a set" record={records.bestReps} />
        </ul>
      </Card>

      {records.repMaxes.length > 0 && (
        <Card
          title="Rep maxes"
          description="The most weight moved for at least that many reps, so a heavy set of 8 also counts as a 5-rep result."
        >
          <ul>
            {records.repMaxes.map((entry) => (
              <li key={entry.reps} className="ui-row">
                <span className="text-sm">{entry.reps} rep{entry.reps === 1 ? "" : "s"}</span>
                <span className="ui-item__meta">
                  {formatKg(entry.weightKg)} kg · {formatDay(entry.performedAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Recent sessions"
        description={
          records.sessions.length > HISTORY_LIMIT
            ? `The last ${HISTORY_LIMIT} of ${records.sessions.length}, newest first.`
            : "Newest first."
        }
      >
        <ul>
          {recent.map((session) => (
            <li key={session.workoutId} className="ui-row">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm">{formatSets(session.sets)}</span>
                <span className="ui-item__meta">
                  {session.workoutTitle} · {formatDay(session.startTime)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
