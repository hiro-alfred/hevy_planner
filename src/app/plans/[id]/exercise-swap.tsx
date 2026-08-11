"use client";

import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
import { buttonClasses } from "@/components/button-styles";
import { EQUIPMENT_LABELS, type EquipmentCategory } from "@/lib/hevy/constants";
import { type ActionState, IDLE } from "@/lib/action-state";
import type { Alternative } from "@/lib/planner/alternatives";
import { loadAlternativesAction, swapExerciseAction } from "./swap-actions";

// The swap picker: an inline expansion under an exercise row.
//
// Inline rather than a modal on purpose — judging whether a replacement fits
// THIS day depends on seeing the exercises either side of it, and a modal severs
// exactly that (knowledge/decisions/exercise-alternatives.md).
//
// Every prop is a serializable scalar so plan-preview.tsx can stay a server
// component: this island is the only client code on the page.

/** Options revealed at a time. The pool is fetched once and paged from memory. */
const PAGE_SIZE = 5;

function equipmentLabel(value: string): string {
  return EQUIPMENT_LABELS[value as EquipmentCategory] ?? value;
}

function muscleLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function ExerciseSwap({
  planId,
  dayIndex,
  exerciseIndex,
  templateId,
  name,
}: {
  planId: number;
  dayIndex: number;
  exerciseIndex: number;
  templateId: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Alternative[] | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [note, setNote] = useState<string | null>(null);
  const [state, setState] = useState<ActionState>(IDLE);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setState(IDLE);
    // One fetch per picker-open: the whole ranked pool arrives at once, so
    // "more alternatives" is free thereafter. Re-opening reuses what we have.
    if (options === null) {
      startTransition(async () => {
        const result = await loadAlternativesAction(planId, dayIndex, exerciseIndex);
        setOptions(result.options);
        setNote(result.message);
      });
    }
  }

  function choose(replacementId: string) {
    startTransition(async () => {
      const result = await swapExerciseAction(
        planId,
        dayIndex,
        exerciseIndex,
        templateId,
        replacementId,
      );
      setState(result);
      if (result.status === "success") {
        // The server revalidated this path, so the row behind us is about to
        // re-render with the new exercise. Drop the stale pool — it was ranked
        // against the exercise that is no longer here.
        setOpen(false);
        setOptions(null);
        setShown(PAGE_SIZE);
      }
    });
  }

  const visible = options?.slice(0, shown) ?? [];
  const remaining = (options?.length ?? 0) - visible.length;

  return (
    <div className="ui-swap">
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        className="ui-linkbtn"
        aria-expanded={open}
      >
        {open ? "Cancel" : "Swap"}
      </button>

      <ActionMessage state={isPending ? IDLE : state} />

      {open && (
        <div className="ui-swap__panel">
          <p className="ui-swap__lead">
            Replacing <b>{name}</b>. Sets, reps and rest carry over, so the session stays the same
            length. The swapped-out exercise will not be suggested again on this plan.
          </p>

          {isPending && options === null && <p className="ui-swap__note">Finding alternatives…</p>}
          {note && <p className="ui-swap__note">{note}</p>}

          {visible.length > 0 && (
            <ul className="ui-swap__list">
              {visible.map((option) => (
                <li key={option.id} className="ui-opt">
                  <span className="ui-opt__title">{option.title}</span>
                  <span className="ui-opt__tags">
                    <span className="ui-tag">{muscleLabel(option.muscleGroup)}</span>
                    <span className="ui-tag">{equipmentLabel(option.equipment)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => choose(option.id)}
                    disabled={isPending}
                    className={buttonClasses("secondary")}
                  >
                    Use this
                  </button>
                </li>
              ))}
            </ul>
          )}

          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + PAGE_SIZE)}
              className="ui-linkbtn"
            >
              More alternatives ({remaining} left)
            </button>
          )}
          {/* Never loop back to the start of the list — a picker that silently
              repeats itself reads as broken. Say the pool is spent instead. */}
          {options !== null && options.length > 0 && remaining === 0 && (
            <p className="ui-swap__note">That is every alternative for this muscle group.</p>
          )}
        </div>
      )}
    </div>
  );
}
