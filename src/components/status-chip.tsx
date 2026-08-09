import type { ReactNode } from "react";

export type ChipTone = "ok" | "live" | "warn" | "idle" | "alert";

/**
 * Coloured dot plus a label. The tone class colours the dot only — the text
 * stays at the normal secondary weight, so a list of four different statuses
 * reads as one column rather than four competing colours.
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
    <span className={`ui-status ui-status--${tone}`}>
      <span className={`ui-status__dot${pulse ? " ui-blip" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}
