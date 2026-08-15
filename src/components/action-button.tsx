"use client";

import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
import { buttonClasses, type ButtonTone } from "@/components/button-styles";
import { type ActionState, IDLE } from "@/lib/action-state";

/**
 * Button that runs a no-argument server action and shows its result inline.
 *
 * Server actions that take no FormData don't fit useActionState, so the pending
 * state comes from useTransition instead. The action reference is passed in by
 * the caller, which keeps this component free of any action-specific imports.
 */
export function ActionButton({
  action,
  label,
  pendingLabel,
  tone = "secondary",
  confirm,
}: {
  action: () => Promise<ActionState>;
  label: string;
  pendingLabel?: string;
  tone?: ButtonTone;
  confirm?: string;
}) {
  const [state, setState] = useState<ActionState>(IDLE);
  const [isPending, startTransition] = useTransition();

  function run() {
    if (confirm && !window.confirm(confirm)) return;
    startTransition(async () => {
      setState(await action());
    });
  }

  return (
    // items-start so the button keeps its intrinsic width inside a column
    // layout instead of stretching to the full panel.
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className={buttonClasses(tone, isPending)}
      >
        {isPending ? (pendingLabel ?? "Working…") : label}
      </button>
      <ActionMessage state={isPending ? IDLE : state} />
    </div>
  );
}
