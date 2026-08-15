"use client";

import { DEFAULT_EQUIPMENT, EQUIPMENT_CATEGORIES, EQUIPMENT_LABELS } from "@/lib/hevy/constants";
import type { SavedProfile } from "@/lib/planner/profile-defaults";
import { Field, Section } from "@/app/plans/new/field";
import {
  EXPERIENCE,
  GOAL_KINDS,
  MINUTES,
  NO_DEFAULT,
  SESSIONS,
  SPLITS,
} from "@/app/plans/new/options";

// The half of the profile that is NOT the optional intake: the answers the plan
// form currently hardcodes to 4 days / 60 minutes / auto / intermediate and a
// fixed equipment list, and which therefore get re-picked on every plan.
//
// Every option list is imported rather than restated. The three optional-intake
// sections are imported wholesale too (see profile-form.tsx) — this file only
// exists because those four selects have no shared component to borrow.

/** Numeric selects need "" as a real option: on a profile, unanswered is valid. */
function optionalNumberValue(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function OptionalSelect({
  name,
  label,
  hint,
  value,
  options,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field label={label} htmlFor={name} hint={hint}>
      <select id={name} name={name} defaultValue={value} className="ui-field">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function PlanDefaultFields({ profile }: { profile: SavedProfile | null }) {
  return (
    <Section
      title="Plan defaults"
      note="What a new plan starts from. Change any of it on the form itself — this only decides what is already filled in."
    >
      <Field
        label="What are you training for?"
        htmlFor="goal"
        hint="Plain English. Words like strength, muscle or conditioning steer the rep ranges."
      >
        <input
          id="goal"
          name="goal"
          maxLength={200}
          placeholder="Build muscle and get stronger"
          defaultValue={profile?.goal}
          className="ui-field"
        />
      </Field>

      <OptionalSelect
        name="goalKind"
        label="Rep ranges"
        hint="Pin these and the sentence above stops being read for a goal it may not name."
        value={profile?.goalKind ?? ""}
        options={GOAL_KINDS}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <OptionalSelect
          name="sessionsPerWeek"
          label="Sessions per week"
          value={optionalNumberValue(profile?.sessionsPerWeek)}
          options={[NO_DEFAULT, ...SESSIONS.map((n) => ({ value: String(n), label: `${n} days` }))]}
        />
        <OptionalSelect
          name="sessionMinutes"
          label="Session length"
          value={optionalNumberValue(profile?.sessionMinutes)}
          options={[
            NO_DEFAULT,
            ...MINUTES.map((n) => ({ value: String(n), label: `${n} minutes` })),
          ]}
        />
        <OptionalSelect
          name="split"
          label="Split"
          value={profile?.split ?? ""}
          options={[NO_DEFAULT, ...SPLITS]}
        />
        <OptionalSelect
          name="experience"
          label="Experience"
          value={profile?.experience ?? ""}
          options={[NO_DEFAULT, ...EXPERIENCE]}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="ui-label">Equipment you can use</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {EQUIPMENT_CATEGORIES.map((category) => (
            <label key={category} className="ui-check">
              <input
                type="checkbox"
                name="equipment"
                value={category}
                // A saved profile wins outright; with none saved this shows the
                // same starting tick set the plan form has always shown, so the
                // first visit reads as "here is what you have", not as a reset.
                defaultChecked={(profile?.equipment ?? DEFAULT_EQUIPMENT).includes(category)}
              />
              {EQUIPMENT_LABELS[category]}
            </label>
          ))}
        </div>
        <p className="text-xs text-ui-faint">
          Untick everything and no equipment default is saved — the plan form picks its own.
        </p>
      </div>
    </Section>
  );
}
