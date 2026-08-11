import Link from "next/link";
import { StatusChip } from "@/components/status-chip";
import type { AccountRoutine } from "@/lib/hevy/routines";
import { relativeDay } from "@/lib/records/format";

// The account's routines as a browsable list.
//
// Rows are LINKS now, into /routines/[id]. That is the whole change in posture:
// this page used to be an inventory you read, and is now a place you open a
// routine from — so every row has to look and behave like a door.

/** Routines with no folder live under Hevy's own default heading. */
export const DEFAULT_FOLDER = "My Routines";

/** How many movements a row names before trailing off into "+3 more". */
const PREVIEW_LENGTH = 3;

export interface RoutineGroup {
  title: string;
  routines: AccountRoutine[];
}

/**
 * Groups routines by folder, the way the Hevy app shows them.
 *
 * Folder ORDER follows first appearance in the routine list rather than folder
 * id: the API returns routines in the account's own order, so following it
 * keeps this page looking like the app the user is comparing it against.
 * Unfiled routines sort last, because they are the leftovers.
 */
export function groupByFolder(routines: AccountRoutine[]): RoutineGroup[] {
  const groups = new Map<string, RoutineGroup>();

  for (const routine of routines) {
    // A folder id whose name never came back still groups — by id, so two
    // different unnamed folders do not merge into one.
    const title =
      routine.folderId === null
        ? DEFAULT_FOLDER
        : (routine.folderTitle ?? `Folder ${routine.folderId}`);
    const held = groups.get(title);
    if (held) held.routines.push(routine);
    else groups.set(title, { title, routines: [routine] });
  }

  return [...groups.values()].sort((a, b) => {
    if (a.title === b.title) return 0;
    if (a.title === DEFAULT_FOLDER) return 1;
    if (b.title === DEFAULT_FOLDER) return -1;
    return 0;
  });
}

function RoutineRow({ routine, index }: { routine: AccountRoutine; index: number }) {
  const owned = routine.planId !== null;
  const stagger = index < 6 ? ` reveal--d${index + 1}` : "";

  // Three names, then a count. Enough to recognise the routine; not so many
  // that the row wraps to three lines on a phone.
  const shown = routine.exercises.slice(0, PREVIEW_LENGTH);
  const preview =
    shown.length === 0
      ? "No exercises"
      : shown.join(" · ") +
        (routine.exercises.length > shown.length
          ? ` +${routine.exercises.length - shown.length} more`
          : "");

  return (
    <li className={`reveal${stagger}`}>
      <Link href={`/routines/${encodeURIComponent(routine.hevyId)}`} className="ui-item">
        <span className="min-w-0 flex-1">
          <span className="ui-item__title block">{routine.title}</span>
          {/* The movements, not just a count: "5 exercises" identifies nothing,
              while "Bench Press · Incline DB Press · Cable Fly" is the routine. */}
          <span className="ui-item__meta block">{preview}</span>
          <span className="ui-item__meta block">
            {routine.exerciseCount} exercise{routine.exerciseCount === 1 ? "" : "s"}
            {owned && ` · day ${routine.day} of ${routine.planTitle ?? `plan ${routine.planId}`}`}
            {routine.lastPerformedAt
              ? ` · trained ${routine.sessionCount}× · last ${relativeDay(routine.lastPerformedAt)}`
              : " · never trained"}
          </span>
        </span>
        <StatusChip tone={owned ? "ok" : "idle"}>{owned ? "From a plan" : "Made in Hevy"}</StatusChip>
        <span className="ui-item__arrow" aria-hidden="true">
          ›
        </span>
      </Link>
    </li>
  );
}

export function RoutineGroups({ groups }: { groups: RoutineGroup[] }) {
  return (
    <div className="flex flex-col gap-7">
      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-1">
          <div className="ui-group">
            <h2 className="ui-eyebrow">{group.title}</h2>
            <span className="ui-card__meta">
              {group.routines.length} routine{group.routines.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="ui-list">
            {group.routines.map((routine, index) => (
              <RoutineRow key={routine.hevyId} routine={routine} index={index} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
