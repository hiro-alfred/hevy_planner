"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/button-styles";
import { ActionMessage } from "@/components/action-message";
import { IDLE } from "@/lib/action-state";
import { saveHevyKeyAction } from "./actions";

/**
 * Key entry form.
 *
 * The input is always EMPTY — the stored key is never sent to the browser, so
 * there is nothing to pre-fill. The masked summary beside it comes from
 * HevyKeyStatus (a boolean plus the last 4 characters).
 *
 * autoComplete="off" keeps password managers from capturing a value that is not
 * a login credential; type="password" keeps it off the screen while typing.
 */
export function HevyKeyForm() {
  const [state, formAction, isPending] = useActionState(saveHevyKeyAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="apiKey" className="ui-label">
        Hevy API key
      </label>
      <input
        id="apiKey"
        name="apiKey"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="Paste your key — it is stored on this server only"
        className="ui-field ui-mono"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className={buttonClasses("primary", isPending)}
        >
          {isPending ? "Verifying…" : "Save key"}
        </button>
        <span className="ui-sub text-xs">Verified against Hevy before it is saved.</span>
      </div>
      <ActionMessage state={isPending ? IDLE : state} />
    </form>
  );
}
