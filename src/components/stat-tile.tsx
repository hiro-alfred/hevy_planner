import { CountUp } from "@/components/count-up";

// Readout tile for the dashboard. Stays a server component — only the counting
// digits inside it are client code.
export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="hud-stat">
      <span className="hud-stat__value">
        <CountUp value={value} />
      </span>
      <span className="hud-stat__label">{label}</span>
    </div>
  );
}
