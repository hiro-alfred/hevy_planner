"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/action-message";
import { buttonClasses } from "@/components/button-styles";
import { IDLE } from "@/lib/action-state";
import type { SavedProfile } from "@/lib/planner/profile-defaults";
import {
  AboutYouFields,
  WorkAroundFields,
  WorkingWeightsFields,
} from "@/app/plans/new/profile-fields";
import { saveProfileAction } from "./actions";
import { PlanDefaultFields } from "./default-fields";

/**
 * The standing profile, as one form.
 *
 * The three optional-intake sections are the SAME components the plan form
 * renders — imported, not copied. That is the whole reason this page is cheap:
 * the two screens cannot disagree about what "phase" means, what the emphasis
 * cap is, or why every weight field has `step="any"`, because there is only one
 * of each field in the codebase.
 *
 * Those sections read a `Partial<PlanRequest>`, and a SavedProfile is one
 * structurally — `PROFILE_IS_A_PARTIAL_REQUEST` in profile-defaults.ts is the
 * compile-time proof, so this cast-free pass-through cannot rot silently.
 */
export function ProfileForm({ profile }: { profile: SavedProfile | null }) {
  const [state, formAction, isPending] = useActionState(saveProfileAction, IDLE);
  const defaults = profile ?? undefined;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <PlanDefaultFields profile={profile} />
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
            {isPending ? "Saving…" : "Save profile"}
          </button>
          <span className="ui-sub text-xs">
            Nothing is sent to Hevy. This only decides what a new plan form starts filled in with.
          </span>
        </div>
        {/* Clearing a field is how you remove it: the save replaces the whole
            document rather than merging, so a blanked bodyweight stays blank. */}
        <p className="text-xs text-ui-faint">
          Emptying a field removes it — saving replaces the profile rather than adding to it.
        </p>
      </div>

      <ActionMessage state={isPending ? IDLE : state} />
    </form>
  );
}
