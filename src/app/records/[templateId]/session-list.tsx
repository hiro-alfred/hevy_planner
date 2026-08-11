import { formatDay, formatKg, relativeDay, setsLegend } from "@/lib/records/format";
import type { ExerciseSession } from "@/lib/records/metrics";

// Recent sessions, set by set.
//
// The previous version printed each session as one collapsed string
// ("100 kg × 8, 8, 7"). That reads well but hides the shape of the session,
// which is the thing a lifter is looking for: which set was the top set, and
// where the reps fell off. One chip per set shows both without a chart.

/** "100 × 8" — weight and reps; the unit is stated once, on the row. */
function setText(set: { weightKg: number | null; reps: number | null }): string {
  if (set.reps === null) return set.weightKg === null ? "—" : formatKg(set.weightKg);
  if (set.weightKg === null || set.weightKg === 0) return `${set.reps}`;
  return `${formatKg(set.weightKg)} × ${set.reps}`;
}

/** Total kg moved in the session — the one number that sums a whole day. */
function volume(session: ExerciseSession): number {
  return session.sets.reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
}

export function SessionList({
  sessions,
  prAt,
}: {
  sessions: ExerciseSession[];
  /** Session date that holds the best estimated 1RM, marked in the list. */
  prAt: string | null;
}) {
  return (
    <ul>
      {sessions.map((session) => {
        const top = Math.max(...session.sets.map((set) => set.weightKg ?? 0), 0);
        const total = volume(session);
        const legend = setsLegend(session.sets);

        return (
          <li key={session.workoutId} className="ui-ex">
            <div className="ui-ex__head">
              <span className="ui-ex__name">
                {formatDay(session.startTime)}
                <span className="ui-ex__num">{relativeDay(session.startTime)}</span>
                {session.startTime === prAt && <span className="ui-ex__num">best 1RM</span>}
              </span>
              <span className="ui-ex__prescription">
                {session.sets.length} set{session.sets.length === 1 ? "" : "s"}
                {total > 0 && ` · ${formatKg(total)} kg total`}
              </span>
            </div>
            <span className="ui-sets">
              {session.sets.map((set, index) => (
                <span
                  key={index}
                  className={`ui-set${set.weightKg !== null && set.weightKg === top && top > 0 ? " ui-set--top" : ""}`}
                >
                  {setText(set)}
                  {set.rpe !== null && <span className="ui-ex__lastLabel">@{set.rpe}</span>}
                </span>
              ))}
            </span>
            <span className="ui-ex__lastLabel">
              {session.workoutTitle}
              {legend && ` · ${legend}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
