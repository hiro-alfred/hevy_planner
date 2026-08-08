import type { ReactNode } from "react";

export type ChipTone = "ok" | "live" | "warn" | "idle" | "alert";

/**
 * Small monospace status badge. The tone class sets `color`, and the border,
 * dot and background all inherit from it via currentColor — so a new tone is
 * one colour declaration in hud.css, not a new set of classes.
 */
export function StatusChip({
  tone,
  pulse = false,
  children,
}: {
  tone: ChipTone;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`hud-chip hud-chip--${tone}`}>
      <span className={`hud-chip__dot${pulse ? " hud-blip" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}
