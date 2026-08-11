"use client";

import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
import { buttonClasses } from "@/components/button-styles";
import { type ActionState, IDLE } from "@/lib/action-state";
import { editExerciseAction } from "./edit-actions";

// Per-exercise set count / rep range / rest, inline under the row.
//
// A sibling of exercise-swap.tsx rather than part of it: two islands of ~150
// lines each stay inside the 300-line file rule, and the two jobs are genuinely
// different — one replaces the movement, the other adjusts the prescription.
//
// Scalars in, scalars out, so plan-preview.tsx stays a server component.

export function ExerciseEdit({
  planId,
  dayIndex,
  exerciseIndex,
  templateId,
  sets,
  repStart,
  repEnd,
  restSeconds,
}: {
  planId: number;
  dayIndex: number;
  exerciseIndex: number;
  templateId: string;
  sets: number;
  repStart: number;
  repEnd: number;
  restSeconds: number;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sets, repStart, repEnd, restSeconds });
  const [state, setState] = useState<ActionState>(IDLE);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    // Re-opening starts from what the server currently holds, not from a
    // half-finished edit abandoned earlier.
    if (!open) setForm({ sets, repStart, repEnd, restSeconds });
    setState(IDLE);
    setOpen(!open);
  }

  function field(name: keyof typeof form) {
    return {
      id: `${name}-${dayIndex}-${exerciseIndex}`,
      type: "number",
      className: "ui-field ui-field--num",
      value: String(form[name]),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        // An empty input parses as NaN; keeping it as 0 would silently submit a
        // value the user never typed, so it is held at 0 and the action refuses.
        setForm({ ...form, [name]: Number(event.target.value) || 0 }),
    };
  }

  function save() {
    startTransition(async () => {
      const result = await editExerciseAction(
        planId,
        dayIndex,
        exerciseIndex,
        templateId,
        form,
      );
      setState(result);
      if (result.status === "success") setOpen(false);
    });
  }

  return (
    <div className="ui-swap">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        className="ui-linkbtn"
        aria-expanded={open}
      >
        {open ? "Cancel" : "Edit"}
      </button>

      <ActionMessage state={isPending ? IDLE : state} />

      {open && (
        <div className="ui-swap__panel">
          <div className="ui-editgrid">
            <span>
              <label htmlFor={`sets-${dayIndex}-${exerciseIndex}`} className="ui-label">
                Sets
              </label>
              <input {...field("sets")} min={1} max={12} />
            </span>
            <span>
              <label htmlFor={`repStart-${dayIndex}-${exerciseIndex}`} className="ui-label">
                Reps from
              </label>
              <input {...field("repStart")} min={1} max={100} />
            </span>
            <span>
              <label htmlFor={`repEnd-${dayIndex}-${exerciseIndex}`} className="ui-label">
                to
              </label>
              <input {...field("repEnd")} min={1} max={100} />
            </span>
            <span>
              <label htmlFor={`restSeconds-${dayIndex}-${exerciseIndex}`} className="ui-label">
                Rest (s)
              </label>
              <input {...field("restSeconds")} min={0} max={900} step={15} />
            </span>
          </div>

          <p className="ui-swap__note">
            Changing sets or rest changes how long the session takes, so the plan may warn that a
            day no longer matches the length you asked for.
          </p>

          <span>
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className={buttonClasses("secondary")}
            >
              {isPending ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
