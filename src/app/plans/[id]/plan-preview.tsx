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
    <div className="flex flex-col gap-5">
      {plan.days.map((day, index) => (
        <section
          key={`${day.title}-${index}`}
          className="rounded-lg border border-black/10 dark:border-white/15"
        >
          <header className="flex items-baseline justify-between gap-4 border-b border-black/10 px-4 py-3 dark:border-white/15">
            <h3 className="font-medium">
              <span className="opacity-50">Day {index + 1} · </span>
              {day.title}
            </h3>
            <span className="text-xs opacity-60">
              {day.exercises.length} exercises · ~{dayMinutes(day.exercises)}
            </span>
          </header>
          <ol className="divide-y divide-black/5 dark:divide-white/10">
            {day.exercises.map((exercise, exerciseIndex) => (
              <li
                key={`${exercise.exerciseTemplateId}-${exerciseIndex}`}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5"
              >
                <span className="text-sm">{exercise.name}</span>
                <span className="text-xs opacity-70">
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
