"use client";

import { useState } from "react";
import { FOCUS_MUSCLE_GROUPS, muscleGroupLabel } from "@/lib/planner/profile";
import { Field, LABEL_CLASSES, Section } from "./field";

// The optional trainee profile, as three form sections. Every field here can be
// left blank: skipping all of them produces exactly the request the form made
// before these existed.

const MAX_FOCUS = 2;

function NumberField({
  name,
  label,
  hint,
  min,
  max,
  step = "any",
  placeholder,
}: {
  name: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  /**
   * Defaults to "any", and every weight field leaves it there.
   *
   * A numeric step is validated against `min` as the base, so min={1} with
   * step={2.5} makes 120 a stepMismatch — and a form that fails constraint
   * validation does not submit and shows nothing next to the button. Weights
   * come in halves, 2.5s and whole numbers depending on the plates; there is
   * no step that is both correct and not a trap.
   */
  step?: number | "any";
  placeholder?: string;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <input
        id={name}
        name={name}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        className="ui-field ui-mono"
      />
    </Field>
  );
}

export function AboutYouFields() {
  return (
    <Section title="About you" note="Optional — sharpens load suggestions and pacing.">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          name="bodyweightKg"
          label="Bodyweight (kg)"
          min={30}
          max={250}
          placeholder="82"
        />
        <NumberField
          name="targetWeightKg"
          label="Target weight (kg)"
          min={30}
          max={250}
          placeholder="78"
        />
        {/* The one genuinely whole-numbered field, so it keeps a step of 1;
            min={13} makes every integer in range valid. */}
        <NumberField name="age" label="Age" min={13} max={100} step={1} placeholder="31" />
      </div>
    </Section>
  );
}

/**
 * Current working weights.
 *
 * Collapsed by default so the fast path stays untouched, and asked for as a top
 * set of five rather than a one-rep max — a form is not a reason for anyone to
 * go and test a max. These are what let the plan arrive in Hevy with starting
 * weights filled in instead of blank.
 */
export function WorkingWeightsFields() {
  return (
    <Section
      title="Your working weights"
      note="Optional — give these and the plan arrives in Hevy with suggested starting weights instead of blanks."
    >
      <details className="ui-disclosure">
        <summary>Add current lifts</summary>
        <div className="grid gap-4 pt-4 sm:grid-cols-2">
          <NumberField
            name="squatKg"
            label="Back squat (kg)"
            min={1}
            max={500}
            placeholder="100"
          />
          <NumberField
            name="benchKg"
            label="Bench press (kg)"
            min={1}
            max={500}
            placeholder="80"
          />
          <NumberField
            name="deadliftKg"
            label="Deadlift (kg)"
            min={1}
            max={500}
            placeholder="140"
          />
          <NumberField
            name="overheadPressKg"
            label="Overhead press (kg)"
            min={1}
            max={500}
            placeholder="50"
          />
        </div>
        <p className="pt-3 text-xs text-ui-faint">
          A comfortable top set of 5 — not a one-rep max. Leave blank what you don&apos;t know.
        </p>
      </details>
    </Section>
  );
}

export function WorkAroundFields() {
  // Enforced here as well as in the schema so the third tick is impossible
  // rather than merely rejected after a round trip.
  const [focus, setFocus] = useState<string[]>([]);

  function toggleFocus(group: string) {
    setFocus((current) =>
      current.includes(group) ? current.filter((item) => item !== group) : [...current, group],
    );
  }

  return (
    <Section title="Work around">
      <Field
        label="Injuries or problem areas"
        htmlFor="injuries"
        hint="Exercises that load these are swapped for something tolerable, not dropped."
      >
        <input
          id="injuries"
          name="injuries"
          maxLength={200}
          placeholder="e.g. right shoulder impingement, lower back twinges on deadlifts"
          className="ui-field"
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className={LABEL_CLASSES}>Extra emphasis (up to {MAX_FOCUS})</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FOCUS_MUSCLE_GROUPS.map((group) => {
            const checked = focus.includes(group);
            return (
              <label
                key={group}
                className={`ui-check${!checked && focus.length >= MAX_FOCUS ? " ui-check--muted" : ""}`}
              >
                <input
                  type="checkbox"
                  name="focusMuscleGroups"
                  value={group}
                  checked={checked}
                  disabled={!checked && focus.length >= MAX_FOCUS}
                  onChange={() => toggleFocus(group)}
                />
                {muscleGroupLabel(group)}
              </label>
            );
          })}
        </div>
      </div>

      <Field
        label="Anything else a coach should know?"
        htmlFor="notes"
        hint="Numbers and injuries belong in the fields above — this is for everything they cannot say."
      >
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={500}
          placeholder="Exercises you hate or can't do, other training (I run Tuesdays), schedule quirks, what's worked before."
          className="ui-field"
        />
      </Field>
    </Section>
  );
}
