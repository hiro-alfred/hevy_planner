import type { ActionState } from "@/lib/action-state";

// Renders the outcome of a server action. Styling is class names only — the
// project bans inline style attributes and <style> blocks.
export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || state.message === "") return null;

  const tone = state.status === "error" ? "error" : "ok";

  return (
    <p className={`hud-notice hud-notice--${tone}`} role="status">
      {state.message}
    </p>
  );
}
