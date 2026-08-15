// Button styling shared by server and client components.
//
// This deliberately does NOT live in action-button.tsx: that file is a client
// module, and a function exported from a client module cannot be CALLED by a
// server component — only rendered as a component or passed as a prop. Calling
// it compiles fine and then fails at request time, so the styling lives here in
// a plain module both sides can import.
//
// The visuals are in ui-controls.css; this maps a tone to its class pair and
// nothing more.

export type ButtonTone = "primary" | "secondary" | "danger";

/**
 * @param working the action this button started is still in flight.
 *
 * This exists because `:disabled { opacity: .45 }` made a BUSY button look
 * exactly like an UNAVAILABLE one, and several of this app's actions are slow
 * enough for that to matter: the first history sync takes minutes, a catalog
 * refresh walks the whole library, and plan generation runs an LLM. The only
 * signal was a swapped label, on a control that had just faded out.
 *
 * `.ui-btn--working` restores most of the opacity and adds a sweeping underline
 * — indeterminate on purpose. None of those actions reports progress; they
 * return once, at the end, so a percentage would be an invention.
 */
export const buttonClasses = (tone: ButtonTone = "primary", working = false) =>
  `ui-btn ui-btn--${tone}${working ? " ui-btn--working" : ""}`;
