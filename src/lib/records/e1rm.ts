// Estimated one-rep max: the one piece of arithmetic every records surface
// shares.
//
// Its own module so that it stays importable WITHOUT a database. metrics.ts
// opens the db client at import time, and both the trend chart and its tests
// need the formula, not the connection.

/**
 * Upper rep bound for an estimated 1RM.
 *
 * Every 1RM formula is a fit to observed data and they all fall apart in high
 * rep ranges. Without this cap a 25-rep back-off set estimates higher than a
 * genuine heavy triple, and the page would report a "record" the lifter has
 * never come close to. Above 12 reps the set still counts for volume and rep
 * records, just not for the estimate.
 */
export const E1RM_MAX_REPS = 12;

/**
 * Epley: weight x (1 + reps/30).
 *
 * Chosen over Brzycki, which divides by (37 - reps) and so goes vertical at 36
 * reps and NEGATIVE beyond it. Real Hevy history contains 20+-rep sets, and a
 * formula that returns nonsense on real data is the wrong formula regardless of
 * which fits a heavy triple marginally better. At reps = 1 Epley returns the
 * weight itself, so an actual single is never "estimated" into something else.
 */
export function epley(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}
