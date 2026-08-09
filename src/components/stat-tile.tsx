import { CountUp } from "@/components/count-up";

// One readout in the .ui-metrics row. Stays a server component — only the
// counting digits inside it are client code.
export function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="ui-stat">
      <span className="ui-stat__value">
        <CountUp value={value} />
      </span>
      <span className="ui-stat__label">{label}</span>
    </div>
  );
}
