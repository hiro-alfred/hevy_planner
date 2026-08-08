"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/action-button";
import { ActionMessage } from "@/components/action-message";
import { IDLE } from "@/lib/action-state";
import { DEFAULT_EQUIPMENT, EQUIPMENT_CATEGORIES, EQUIPMENT_LABELS } from "@/lib/hevy/constants";
import { createPlanAction } from "../actions";

const SESSIONS = [2, 3, 4, 5, 6];
const MINUTES = [30, 45, 60, 75, 90];

const SPLITS = [
  { value: "auto", label: "Pick for me" },
  { value: "full_body", label: "Full body" },
  { value: "upper_lower", label: "Upper / lower" },
  { value: "push_pull_legs", label: "Push / pull / legs" },
];

const EXPERIENCE = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const fieldClasses =
  "rounded-md border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20";

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs opacity-60">{hint}</p>}
    </div>
  );
}

/**
 * Plan request form. Generation runs inside the server action and can take a
 * while with an LLM configured, so the submit button carries the pending state.
 */
export function PlanForm() {
  const [state, formAction, isPending] = useActionState(createPlanAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="What are you training for?"
        htmlFor="goal"
        hint="Plain English. Words like strength, muscle, or conditioning steer the rep ranges."
      >
        <input
          id="goal"
          name="goal"
          required
          defaultValue="Build muscle and get stronger"
          className={fieldClasses}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Sessions per week" htmlFor="sessionsPerWeek">
          <select id="sessionsPerWeek" name="sessionsPerWeek" defaultValue={4} className={fieldClasses}>
            {SESSIONS.map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </Field>

        <Field label="Session length" htmlFor="sessionMinutes">
          <select id="sessionMinutes" name="sessionMinutes" defaultValue={60} className={fieldClasses}>
            {MINUTES.map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </Field>

        <Field label="Split" htmlFor="split">
          <select id="split" name="split" defaultValue="auto" className={fieldClasses}>
            {SPLITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Experience" htmlFor="experience">
          <select id="experience" name="experience" defaultValue="intermediate" className={fieldClasses}>
            {EXPERIENCE.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Equipment you can use</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EQUIPMENT_CATEGORIES.map((category) => (
            <label key={category} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="equipment"
                value={category}
                defaultChecked={DEFAULT_EQUIPMENT.includes(category)}
              />
              {EQUIPMENT_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className={buttonClasses("primary")}>
          {isPending ? "Building your plan…" : "Generate plan"}
        </button>
        <span className="text-xs opacity-70">
          Nothing is sent to Hevy until you review the plan and press sync.
        </span>
      </div>

      <ActionMessage state={isPending ? IDLE : state} />
    </form>
  );
}
