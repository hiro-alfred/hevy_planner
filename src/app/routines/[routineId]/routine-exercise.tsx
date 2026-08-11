import Link from "next/link";
import { describeRest, summariseSets } from "@/lib/hevy/routine-format";
import type { RoutineExerciseDetail } from "@/lib/hevy/routine-detail";
import { formatKg, relativeDay, setsLegend } from "@/lib/records/format";

// One exercise inside an opened routine.
//
// The whole point of the screen is the second line: the routine says what to
// do, the cache says what you did last time. Showing either alone is what the
// Hevy app already does well enough — putting them together is why this page
// exists.

/** "100 kg × 8" / "8 reps" — one logged set, as a chip. */
function setText(set: { weightKg: number | null; reps: number | null }): string {
  if (set.reps === null) return set.weightKg === null ? "—" : `${formatKg(set.weightKg)} kg`;
  if (set.weightKg === null || set.weightKg === 0) return `${set.reps}`;
  return `${formatKg(set.weightKg)} × ${set.reps}`;
}

export function RoutineExercise({ exercise }: { exercise: RoutineExerciseDetail }) {
  const sets = summariseSets(exercise.sets);
  const rest = describeRest(exercise.restSeconds);
  const last = exercise.last;
  // The heaviest set of last session, so the chip row shows where the work
  // actually was rather than making every set look equal.
  const topWeight = last
    ? Math.max(...last.sets.map((set) => set.weightKg ?? 0), 0)
    : 0;

  return (
    <li className="ui-ex">
      <div className="ui-ex__head">
        <span className="ui-ex__name">
          <span className="ui-ex__num">{String(exercise.index + 1).padStart(2, "0")}</span>
          {/* Links only when there is history to link to — a dead link to an
              empty records page is worse than plain text. */}
          {last ? (
            <Link href={`/records/${encodeURIComponent(exercise.templateId)}`} className="underline">
              {exercise.title}
            </Link>
          ) : (
            exercise.title
          )}
          {exercise.supersetId !== null && (
            <span className="ui-ex__num">superset {exercise.supersetId + 1}</span>
          )}
        </span>
        <span className="ui-ex__prescription">
          {sets.text || `${sets.working} sets`}
          {rest && ` · ${rest}`}
          {sets.warmups > 0 && ` · ${sets.warmups} warm-up${sets.warmups === 1 ? "" : "s"}`}
        </span>
      </div>

      {exercise.notes && <p className="ui-ex__notes">{exercise.notes}</p>}

      <div className="ui-ex__last">
        {last ? (
          <>
            {/* The unit lives in the label, not on every chip: a row of eight
                sets each repeating "kg" is a row of eight "kg"s. It is read
                from the sets, so a bodyweight movement is not labelled with a
                weight it never had. */}
            <span className="ui-ex__lastLabel">
              Last time · {relativeDay(last.startTime)}
              {setsLegend(last.sets) && ` · ${setsLegend(last.sets)}`}
            </span>
            <span className="ui-sets">
              {last.sets.map((set, index) => (
                <span
                  key={index}
                  className={`ui-set${set.weightKg !== null && set.weightKg === topWeight && topWeight > 0 ? " ui-set--top" : ""}`}
                >
                  {setText(set)}
                  {set.rpe !== null && <span className="ui-ex__lastLabel">@{set.rpe}</span>}
                </span>
              ))}
            </span>
          </>
        ) : (
          <span className="ui-ex__lastLabel">
            {exercise.muscleGroup
              ? `No logged sets yet · ${exercise.muscleGroup}`
              : "No logged sets yet"}
          </span>
        )}
      </div>
    </li>
  );
}
