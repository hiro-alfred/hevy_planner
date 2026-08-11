import { Card } from "@/components/card";
import { StatusChip, type ChipTone } from "@/components/status-chip";
import { formatKg } from "@/lib/records/format";
import type { Recommendation, RecommendationKind } from "@/lib/records/progression";

// The progressive-overload recommendation, rendered.
//
// Deliberately states its own reasoning: a number with no argument behind it is
// something a lifter either follows blindly or ignores, and neither is useful.

const TONE: Record<RecommendationKind, ChipTone> = {
  add_weight: "ok",
  add_reps: "live",
  hold: "idle",
  deload: "warn",
  baseline: "idle",
};

const LABEL: Record<RecommendationKind, string> = {
  add_weight: "Add weight",
  add_reps: "Add reps",
  hold: "Repeat",
  deload: "Back off",
  baseline: "Need more data",
};

/** "3 sets of 8 at 62.5 kg" — the prescription, in the order a lifter reads it. */
function headline(recommendation: Recommendation, setCount: number): string {
  const target =
    recommendation.targetWeightKg === null || recommendation.targetWeightKg === 0
      ? `${recommendation.targetReps} reps`
      : `${recommendation.targetReps} reps at ${formatKg(recommendation.targetWeightKg)} kg`;
  return setCount > 0 ? `${setCount} × ${target}` : target;
}

export function RecommendationCard({
  recommendation,
  setCount,
}: {
  recommendation: Recommendation;
  setCount: number;
}) {
  return (
    <Card
      title="Next session"
      eyebrow="Progressive overload"
      description={`Double progression in the ${recommendation.repRange.start}–${recommendation.repRange.end} rep range, read from what you have actually been lifting.`}
      actions={<StatusChip tone={TONE[recommendation.kind]}>{LABEL[recommendation.kind]}</StatusChip>}
    >
      <div className="flex flex-col gap-3">
        <p className="ui-h1 text-2xl">{headline(recommendation, setCount)}</p>
        <p className="text-sm leading-relaxed">{recommendation.reason}</p>
        {/* Both caveats are load-bearing. Warm-ups being excluded explains why a
            number here can disagree with what the Hevy app shows, and the
            read-only note matters because everything else in this app that
            produces a prescription can be pushed to Hevy — this cannot. */}
        <div className="ui-notice ui-notice--info">
          Calculated from your logged working sets; warm-ups are ignored. This is a suggestion
          only — nothing here is written to Hevy.
        </div>
      </div>
    </Card>
  );
}
