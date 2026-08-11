import { exerciseSeconds } from "@/lib/planner/prescription";
import type { Plan, PlanExercise } from "@/lib/planner/schema";
import { suggestionKey, type LoadSuggestion } from "@/lib/planner/suggested-loads";
import { ExerciseEdit } from "./exercise-edit";
import { ExerciseSwap } from "./exercise-swap";

// Rendering of a generated plan. Read-only except for the per-exercise swap and
// edit, which are the minimal-plus editor.
//
// This stays a SERVER component — the swap picker and the edit form are the only
// client code, and they take scalars so neither the plan document nor the
// suggestion map ever crosses the boundary.

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

/**
 * The one load an exercise carries, or null when it carries none.
 *
 * `undefined` means the sets disagree — representable in the model, produced by
 * nothing, and worth saying out loud rather than reporting the first set's
 * weight as if it were the whole story.
 */
function uniformLoad(exercise: PlanExercise): number | null | undefined {
  const first = exercise.sets[0]!.weightKg;
  return exercise.sets.every((set) => set.weightKg === first) ? first : undefined;
}

function sessions(count: number): string {
  return `${count} session${count === 1 ? "" : "s"}`;
}

/**
 * The load line under an exercise: what the plan says, what the history says.
 *
 * The plan's own weight is printed whenever it exists, which it did not use to
 * be — the LLM path has been able to set one from the trainee's stated working
 * weights since the profile fields landed, and an unshown weight still syncs to
 * Hevy. A number that becomes a routine should be legible before it does.
 */
function LoadLine({
  exercise,
  suggestion,
}: {
  exercise: PlanExercise;
  suggestion: LoadSuggestion | undefined;
}) {
  const load = uniformLoad(exercise);
  const planned =
    load === undefined ? "Sets carry different weights" : load === null ? null : `${load} kg`;

  if (!suggestion) {
    return (
      <span className="ui-load">
        {planned ? (
          <b className="ui-load__weight">{planned}</b>
        ) : (
          <span className="ui-load__empty">No starting load — you fill it in Hevy</span>
        )}
      </span>
    );
  }

  const already = load === suggestion.weightKg;

  return (
    <span className="ui-load">
      {planned && <b className="ui-load__weight">{planned}</b>}
      {!already && (
        <span className={`ui-load__hint${suggestion.transferable ? "" : " ui-load__hint--off"}`}>
          {planned ? "history says " : "suggested "}
          <b>{suggestion.weightKg} kg</b>
          {suggestion.transferable
            ? ` — ${suggestion.summary}`
            : ` at ${suggestion.repRange.start}–${suggestion.repRange.end} reps, not this plan's ` +
              `${exercise.sets[0]!.repRange.start}–${exercise.sets[0]!.repRange.end} — set it yourself if it fits`}
        </span>
      )}
      <span className="ui-load__from">
        {already ? "matches your history · " : ""}
        {sessions(suggestion.sessionCount)} logged
      </span>
    </span>
  );
}

export function PlanPreview({
  plan,
  planId,
  suggestions,
}: {
  plan: Plan;
  planId: number;
  suggestions: Map<string, LoadSuggestion>;
}) {
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
                <span className="flex items-baseline gap-3.5">
                  <span className="ui-mono text-xs text-ui-faint">
                    {describeSets(exercise)} · {exercise.restSeconds}s rest
                  </span>
                  <ExerciseEdit
                    planId={planId}
                    dayIndex={index}
                    exerciseIndex={exerciseIndex}
                    templateId={exercise.exerciseTemplateId}
                    sets={exercise.sets.length}
                    repStart={exercise.sets[0]!.repRange.start}
                    repEnd={exercise.sets[0]!.repRange.end}
                    restSeconds={exercise.restSeconds}
                    weightKg={uniformLoad(exercise) ?? null}
                  />
                  <ExerciseSwap
                    planId={planId}
                    dayIndex={index}
                    exerciseIndex={exerciseIndex}
                    templateId={exercise.exerciseTemplateId}
                    name={exercise.name}
                  />
                </span>
                <LoadLine
                  exercise={exercise}
                  suggestion={suggestions.get(suggestionKey(index, exerciseIndex))}
                />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
