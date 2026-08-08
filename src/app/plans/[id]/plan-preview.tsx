import { PointerGlow } from "@/components/pointer-glow";
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
          className={`hud-panel reveal${index < 6 ? ` reveal--d${index + 1}` : ""}`}
        >
          <PointerGlow />
          <span className="hud-panel__scan" aria-hidden="true" />
          <header className="hud-panel__head items-baseline">
            <h3 className="flex flex-wrap items-baseline gap-2">
              <span className="hud-mono text-xs tracking-[0.18em] text-hud-cyan uppercase">
                Day {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-medium tracking-wide uppercase">{day.title}</span>
            </h3>
            <span className="hud-mono shrink-0 text-xs text-hud-dim">
              {day.exercises.length} ex · ~{dayMinutes(day.exercises)}
            </span>
          </header>
          <ol className="divide-y divide-hud-line-soft">
            {day.exercises.map((exercise, exerciseIndex) => (
              <li
                key={`${exercise.exerciseTemplateId}-${exerciseIndex}`}
                className="hud-row py-2.5"
              >
                <span className="flex items-baseline gap-3 text-sm">
                  <span className="hud-mono text-[0.625rem] text-hud-dim">
                    {String(exerciseIndex + 1).padStart(2, "0")}
                  </span>
                  {exercise.name}
                </span>
                <span className="hud-mono text-xs text-hud-dim">
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
