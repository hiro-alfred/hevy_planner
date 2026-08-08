import type { ActionState } from "@/lib/action-state";

// Renders the outcome of a server action. Styling is Tailwind utility classes
// only — the project bans inline style attributes and <style> blocks.
export function ActionMessage({ state }: { state: ActionState }) {
  if (state.status === "idle" || state.message === "") return null;

  const tone =
    state.status === "error"
      ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
      : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";

  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${tone}`} role="status">
      {state.message}
    </p>
  );
}
