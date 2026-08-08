import "server-only";

// Serialises sync runs for a single plan.
//
// Why this exists: syncPlan decides what to create by READING state (the plan's
// folder id, its sync_links rows) and only then WRITING to Hevy. Two runs that
// interleave between the read and the write both conclude "nothing exists yet"
// and both create a folder and a routine. The UNIQUE(plan_id, day_index) index
// stops the second link row from being stored — but the duplicate routine is
// already in Hevy by then, and Hevy has no DELETE. Guarding the database is not
// enough; the decision and the write have to be one critical section.
//
// Realistically this is two browser tabs, or a double-click that outran the
// button's disabled state.

const chains = new Map<number, Promise<unknown>>();

/**
 * Runs `fn` only once any previous run for the same plan has settled.
 *
 * Callers queue rather than fail: the second run then sees the first run's
 * committed links and correctly reports every day as unchanged.
 */
export function withPlanLock<T>(planId: number, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(planId) ?? Promise.resolve();

  // Run after the previous attempt whether it succeeded or failed — a failed
  // sync must not wedge the plan.
  const result = previous.then(fn, fn);

  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  chains.set(planId, tail);

  // Drop the entry once this is the last queued run, so the map cannot grow
  // without bound over a long-lived process.
  void tail.then(() => {
    if (chains.get(planId) === tail) chains.delete(planId);
  });

  return result;
}

/**
 * Single-process only. The lock lives in memory, so it holds for one server —
 * which is the deployment this app is built for (SQLite on a local volume,
 * see knowledge/systems/deployment.md). Running several app instances against
 * one database would need a lock in the database instead.
 */
