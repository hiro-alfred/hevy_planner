"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/button-styles";
import { ActionMessage } from "@/components/action-message";
import { type ActionState, IDLE } from "@/lib/action-state";
import { DEFAULT_EQUIPMENT, EQUIPMENT_CATEGORIES, EQUIPMENT_LABELS } from "@/lib/hevy/constants";
import type { PlanRequest } from "@/lib/planner/schema";
import { createPlanAction } from "../actions";
import { Field, Section } from "./field";
import { EXPERIENCE, GOAL_KINDS, MINUTES, SESSIONS, SPLITS } from "./options";
import { AboutYouFields, WorkAroundFields, WorkingWeightsFields } from "./profile-fields";

/**
 * Plan request form. Generation runs inside the server action and can take a
 * while with an LLM configured, so the submit button carries the pending state.
 *
 * Serves three callers: creating a plan, editing an existing plan's request,
 * and — since the profile page landed — creating a plan pre-filled from the
 * standing profile. The edit case passes `defaults` from the stored request and
 * its own action, which forks rather than overwriting, so the flows share one
 * form instead of drifting apart field by field.
 *
 * `defaults` is a PARTIAL request, not a whole one. A stored plan request is
 * complete, but a saved profile answers only what its owner chose to answer —
 * and every read below is already `defaults?.x ?? fallback`, so widening the
 * type changes no behaviour. Typing a partial object as a PlanRequest would be
 * a lie the compiler would accept and the form would then act on.
 */
export function PlanForm({
  action = createPlanAction,
  defaults,
  submitLabel = "Generate plan",
  pendingLabel = "Building your plan…",
  note = "Nothing is sent to Hevy until you review the plan and press sync.",
}: {
  action?: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: Partial<PlanRequest>;
  submitLabel?: string;
  pendingLabel?: string;
  note?: string;
} = {}) {
  const [state, formAction, isPending] = useActionState(action, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Field
        label="What are you training for?"
        htmlFor="goal"
        hint="Plain English. Words like strength, muscle, or conditioning steer the rep ranges."
      >
        <input
          id="goal"
          name="goal"
          required
          defaultValue={defaults?.goal ?? "Build muscle and get stronger"}
          className="ui-field"
        />
      </Field>

      <Field
        label="Rep ranges"
        htmlFor="goalKind"
        hint="Override the reading above if it is not what you meant."
      >
        <select
          id="goalKind"
          name="goalKind"
          defaultValue={defaults?.goalKind ?? ""}
          className="ui-field"
        >
          {GOAL_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Sessions per week" htmlFor="sessionsPerWeek">
          <select
            id="sessionsPerWeek"
            name="sessionsPerWeek"
            defaultValue={defaults?.sessionsPerWeek ?? 4}
            className="ui-field"
          >
            {SESSIONS.map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </Field>

        <Field label="Session length" htmlFor="sessionMinutes">
          <select
            id="sessionMinutes"
            name="sessionMinutes"
            defaultValue={defaults?.sessionMinutes ?? 60}
            className="ui-field"
          >
            {MINUTES.map((n) => (
              <option key={n} value={n}>
                {n} minutes
              </option>
            ))}
          </select>
        </Field>

        <Field label="Split" htmlFor="split">
          <select
            id="split"
            name="split"
            defaultValue={defaults?.split ?? "auto"}
            className="ui-field"
          >
            {SPLITS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Experience" htmlFor="experience">
          <select
            id="experience"
            name="experience"
            defaultValue={defaults?.experience ?? "intermediate"}
            className="ui-field"
          >
            {EXPERIENCE.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Section title="Equipment you can use">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EQUIPMENT_CATEGORIES.map((category) => (
            <label key={category} className="ui-check">
              <input
                type="checkbox"
                name="equipment"
                value={category}
                defaultChecked={(defaults?.equipment ?? DEFAULT_EQUIPMENT).includes(category)}
              />
              {EQUIPMENT_LABELS[category]}
            </label>
          ))}
        </div>
      </Section>

      {/* Everything below is optional. Order is deliberate: what you want, then
          who you are, then what to work around — a form that opens with injury
          questions reads like a clinic intake. */}
      <AboutYouFields defaults={defaults} />
      <WorkingWeightsFields defaults={defaults} />
      <WorkAroundFields defaults={defaults} />

      <div className="flex flex-col gap-3 border-t border-ui-line pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className={buttonClasses("primary", isPending)}
          >
            {isPending ? pendingLabel : submitLabel}
          </button>
          <span className="ui-sub text-xs">{note}</span>
        </div>
        <p className="text-xs text-ui-faint">
          Plans are generated suggestions, not medical advice — train around pain, and get
          persistent pain looked at.
        </p>
      </div>

      <ActionMessage state={isPending ? IDLE : state} />
    </form>
  );
}
