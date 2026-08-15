import type { ActionState } from "@/lib/action-state";

// Renders the outcome of a server action. Styling is class names only — the
// project bans inline style attributes and <style> blocks.
export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || state.message === "") return null;

  const tone = state.status === "error" ? "error" : "ok";

  // `--result` rather than a rule on .ui-notice: the base class also carries a
  // dozen STATIC page notices, which already animate in with their card's
  // .reveal and would otherwise play two entrances at once. This modifier means
  // "I just appeared because you pressed something", which is the case worth
  // marking — the outcome renders below the control, where the eye is not.
  return (
    <p className={`ui-notice ui-notice--${tone} ui-notice--result`} role="status">
      {state.message}
    </p>
  );
}
