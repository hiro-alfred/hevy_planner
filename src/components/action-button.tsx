"use client";

import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
import { type ActionState, IDLE } from "@/lib/action-state";

export type ButtonTone = "primary" | "secondary" | "danger";

const TONE_CLASSES: Record<ButtonTone, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
  danger: "border border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300",
};

export const buttonClasses = (tone: ButtonTone = "primary") =>
  `inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASSES[tone]}`;

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
    <div className="flex flex-col gap-2">
      <button type="button" onClick={run} disabled={isPending} className={buttonClasses(tone)}>
        {isPending ? (pendingLabel ?? "Working…") : label}
      </button>
      <ActionMessage state={isPending ? IDLE : state} />
    </div>
  );
}
