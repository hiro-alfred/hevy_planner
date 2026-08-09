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

export const buttonClasses = (tone: ButtonTone = "primary") => `ui-btn ui-btn--${tone}`;
