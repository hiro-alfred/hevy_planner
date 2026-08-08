// Button styling shared by server and client components.
//
// This deliberately does NOT live in action-button.tsx: that file is a client
// module, and a function exported from a client module cannot be CALLED by a
// server component — only rendered as a component or passed as a prop. Calling
// it compiles fine and then fails at request time, so the styling lives here in
// a plain module both sides can import.

export type ButtonTone = "primary" | "secondary" | "danger";

const TONE_CLASSES: Record<ButtonTone, string> = {
  primary: "bg-foreground text-background hover:opacity-90",
  secondary: "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10",
  danger: "border border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300",
};

export const buttonClasses = (tone: ButtonTone = "primary") =>
  `inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${TONE_CLASSES[tone]}`;
