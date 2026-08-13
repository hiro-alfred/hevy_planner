"use client";

import { useActionState } from "react";
import { ActionMessage } from "@/components/action-message";
import { buttonClasses } from "@/components/button-styles";
import { IDLE } from "@/lib/action-state";
import { hevyKeyLoginAction } from "./actions";

/**
 * Sign-in form for the Hevy-key gate.
 *
 * `next` rides along as a hidden field rather than being read from the URL in
 * the action: a server action has no access to the page's query string, and
 * re-deriving it from a Referer header would be trusting a header the browser
 * is free to omit. The action sanitises it either way (safeNextPath).
 *
 * autoComplete="current-password" here, unlike the settings page's key field
 * which uses "off" — on this page the key genuinely IS the login credential, so
 * a password manager remembering it is the desired behaviour.
 */
export function HevyKeyLoginForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState(hevyKeyLoginAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="apiKey" className="ui-label">
        Hevy API key
      </label>
      <input
        id="apiKey"
        name="apiKey"
        type="password"
        autoComplete="current-password"
        spellCheck={false}
        required
        placeholder="Paste your Hevy Pro developer key"
        className="ui-field ui-mono"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={isPending} className={buttonClasses("primary")}>
          {isPending ? "Checking…" : "Sign in"}
        </button>
      </div>
      <ActionMessage state={isPending ? IDLE : state} />
    </form>
  );
}
