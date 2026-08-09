import { exerciseSeconds } from "@/lib/planner/prescription";
import type { Plan, PlanExercise } from "@/lib/planner/schema";

// Read-only rendering of a generated plan. Phase 1 is preview + sync; the
// minimal-plus editor (swap exercise, tweak sets/reps/rest) comes later.

function describeSets(exercise: PlanExercise): string {
  const first = exercise.sets[0]!;
  const uniform = exercise.sets.every(
    (set) => set.repRange.start === first.repRange.start && set.repRange.end === first.repRange.end,
  );
  const reps = uniform
    ? `${first.repRange.start}–${first.repRange.end}`
    : exercise.sets.map((set) => `${set.repRange.start}–${set.repRange.end}`).join(", ");
  return `${exercise.sets.length} × ${reps} reps`;
}

function minutes(seconds: number): string {
  return `${Math.round(seconds / 60)} min`;
}

function dayMinutes(exercises: PlanExercise[]): string {
  const total = exercises.reduce(
    (sum, exercise) => sum + exerciseSeconds(exercise.sets.length, exercise.restSeconds),
    0,
  );
  return minutes(total);
}

export function PlanPreview({ plan }: { plan: Plan }) {
  return (
    <div className="flex flex-col gap-4">
      {plan.days.map((day, index) => (
        <section
          key={`${day.title}-${index}`}
          // Stagger caps at six days, which is also the most Hevy plans have.
          className={`ui-card reveal${index < 6 ? ` reveal--d${index + 1}` : ""}`}
        >
          <header className="ui-card__head items-baseline">
            <h3 className="ui-card__title">
              <b>Day {String(index + 1).padStart(2, "0")}</b>
              {day.title}
            </h3>
            <span className="ui-card__meta">
              {day.exercises.length} exercises · ~{dayMinutes(day.exercises)}
            </span>
          </header>
          <ol>
            {day.exercises.map((exercise, exerciseIndex) => (
              <li key={`${exercise.exerciseTemplateId}-${exerciseIndex}`} className="ui-row">
                <span className="flex items-baseline gap-3.5 text-sm">
                  <span className="ui-mono text-xs text-ui-faint">
                    {String(exerciseIndex + 1).padStart(2, "0")}
                  </span>
                  {exercise.name}
                </span>
                <span className="ui-mono text-xs text-ui-faint">
                  {describeSets(exercise)} · {exercise.restSeconds}s rest
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
