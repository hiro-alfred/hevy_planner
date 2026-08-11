import Link from "next/link";
import { StatusChip, type ChipTone } from "@/components/status-chip";
import { formatKg, relativeDay } from "@/lib/records/format";
import type { ExerciseRecordSummary } from "@/lib/records/metrics";

// The records index, as rows.
//
// Split out of the page so the page stays about fetching and filtering. Rows
// are full-width links into the exercise, matching the plans list — an
// underlined word inside a row is a smaller target than the row itself, and
// the row was already the thing being pointed at.

/** Days after which a lift reads as dropped rather than in-progress. */
const STALE_DAYS = 21;

/**
 * How current the training is, as a dot.
 *
 * Three states only. This is the question the index is really asked — "am I
 * still training this?" — and a colour scale with more steps than that invites
 * the reader to decode it instead of read it.
 */
function freshness(lastPerformedAt: string, now: Date): { tone: ChipTone; label: string } {
  const days = Math.floor((now.getTime() - new Date(lastPerformedAt).getTime()) / 86_400_000);
  if (days <= 7) return { tone: "ok", label: relativeDay(lastPerformedAt, now) };
  if (days <= STALE_DAYS) return { tone: "warn", label: relativeDay(lastPerformedAt, now) };
  return { tone: "idle", label: relativeDay(lastPerformedAt, now) };
}

function RecordRow({
  record,
  index,
  now,
}: {
  record: ExerciseRecordSummary;
  index: number;
  now: Date;
}) {
  // Three cases, not two. A bodyweight movement has no weight records, and a
  // plank has neither weight NOR reps — printing "null reps" for it, as an
  // earlier version did, reads as a bug rather than as the nature of the
  // exercise.
  const weighted = record.heaviestKg !== null;
  const headline = weighted
    ? `${formatKg(record.heaviestKg)} kg`
    : record.bestReps !== null
      ? `${record.bestReps} reps`
      : "—";
  const support = weighted
    ? `heaviest · est. 1RM ${formatKg(record.bestE1rmKg)} kg`
    : record.bestReps !== null
      ? "best set"
      : "timed or measured only";

  const state = freshness(record.lastPerformedAt, now);
  const stagger = index < 6 ? ` reveal--d${index + 1}` : "";

  return (
    <li className={`reveal${stagger}`}>
      <Link href={`/records/${encodeURIComponent(record.templateId)}`} className="ui-item">
        <span className="min-w-0 flex-1">
          <span className="ui-item__title block">{record.title}</span>
          <span className="ui-item__meta block">
            {record.sessionCount} session{record.sessionCount === 1 ? "" : "s"} · {support}
          </span>
        </span>
        {/* The number is the reason the row exists, so it gets the size and the
            tabular alignment rather than being folded into the meta line. */}
        <span className="ui-ex__prescription text-sm">{headline}</span>
        <StatusChip tone={state.tone}>{state.label}</StatusChip>
        <span className="ui-item__arrow" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}

export function RecordList({ records }: { records: ExerciseRecordSummary[] }) {
  // One clock for the whole list: rendering is fast, but a per-row `new Date()`
  // could still straddle midnight and print two different "today"s.
  const now = new Date();

  return (
    <ul className="ui-list">
      {records.map((record, index) => (
        <RecordRow key={record.templateId} record={record} index={index} now={now} />
      ))}
    </ul>
  );
}
