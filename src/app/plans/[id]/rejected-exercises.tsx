import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { getTemplatesByIds } from "@/lib/hevy/catalog";
import { clearExclusionAction } from "./swap-actions";

// The rejected-exercise list and its undo.
//
// This ships in the same pass as the swap for a reason the design called out as
// a known gap: a swap is a PERMANENT rejection for the plan, so without a way to
// see and clear the list, the first accidental swap can never be taken back.
//
// A server component — one batch lookup for the titles, then two bound actions.

export async function RejectedExercises({
  planId,
  excluded,
}: {
  planId: number;
  excluded: string[];
}) {
  if (excluded.length === 0) return null;

  // One query for every id, not one per row.
  const catalog = await getTemplatesByIds(excluded);

  return (
    <Card
      title="Rejected exercises"
      description={
        `${excluded.length} exercise${excluded.length === 1 ? "" : "s"} you swapped away from. ` +
        "They are kept out of this plan's suggestions, including when you regenerate. " +
        "Restoring one returns it to the pool — it does not put it back into the plan."
      }
      actions={
        excluded.length > 1 ? (
          <ActionButton
            action={clearExclusionAction.bind(null, planId, null)}
            label="Clear all"
            pendingLabel="Clearing…"
            confirm="Allow every rejected exercise to be suggested again on this plan?"
          />
        ) : undefined
      }
    >
      <ul className="ui-list">
        {excluded.map((id) => (
          <li key={id} className="ui-row">
            {/* An id with no catalog row means the catalog was refreshed and no
                longer carries that template. Showing the raw id is honest, and
                the row still offers the only useful action: drop it. */}
            <span className="text-sm">{catalog.get(id)?.title ?? id}</span>
            <ActionButton
              action={clearExclusionAction.bind(null, planId, id)}
              label="Restore"
              pendingLabel="Restoring…"
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
