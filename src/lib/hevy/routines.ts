import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans, syncLinks } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
import { getRoutineActivity } from "@/lib/records/last-session";
import type { HevyClient } from "./client";

// Reading the Hevy account back.
//
// Everything else in lib/hevy writes: sync creates and updates routines and
// records what it did. Nothing until now ever ASKED Hevy what is actually
// there, so the app knew only about routines it had created itself. That blind
// spot matters more than it sounds, because the API has no DELETE and caps how
// many routines an account may hold: the cap was previously discoverable only by
// a POST failing with a 403, halfway through creating a plan's days.
//
// Strictly read-only. Nothing here can create, modify or lose anything.

/** Safety valve against a looping or misreporting pagination response. */
const MAX_PAGES = 100;

export interface AccountRoutine {
  hevyId: string;
  title: string;
  exerciseCount: number;
  folderId: number | null;
  /** The folder's name, or null for the default "My Routines". */
  folderTitle: string | null;
  /**
   * Every movement in the routine, in order.
   *
   * The list page shows only the first few, but it SEARCHES all of them —
   * "which routine has the curls in it" is a question the truncated version
   * would answer wrongly and silently.
   */
  exercises: string[];
  /** The plan that owns this routine, if this app created it. */
  planId: number | null;
  planTitle: string | null;
  /** 1-based day number within that plan. */
  day: number | null;
  /** When this routine was last actually trained, from the local cache. */
  lastPerformedAt: string | null;
  sessionCount: number;
}

export interface AccountRoutines {
  routines: AccountRoutine[];
  /** Created by this app and still owned by a plan. */
  linked: number;
  /** Everything else: made in the Hevy app, or orphaned by a deleted plan. */
  foreign: number;
  /** Routines with at least one logged workout behind them. */
  trained: number;
}

/**
 * Folder id → title for the whole account.
 *
 * Its own paged walk, and worth it: without it every routine made in the Hevy
 * app lands in an anonymous "folder 42", and the list cannot be grouped the way
 * the Hevy app itself shows it. Folders are few, so this is one or two requests.
 *
 * A failure here is swallowed to an empty map by the caller rather than
 * propagated — a missing folder NAME must not cost the user the routine list.
 */
export async function folderTitles(client: HevyClient): Promise<Map<number, string>> {
  const titles = new Map<number, string>();
  let page = 1;
  let pageCount = 1;
  do {
    const res = await client.getRoutineFolders(page);
    for (const folder of res.routine_folders ?? []) {
      if (typeof folder.id === "number") titles.set(folder.id, folder.title);
    }
    pageCount = res.page_count || 1;
    if (pageCount > MAX_PAGES) break;
    page += 1;
  } while (page <= pageCount);
  return titles;
}

/**
 * Every routine in the account, each labelled with the plan that owns it.
 *
 * The join is done in memory against ONE query for all sync links, not a lookup
 * per routine — a query per row is the N+1 pattern the project bans, and it
 * would be especially silly here where the whole link table is a few dozen rows.
 */
export async function getAccountRoutines(client: HevyClient): Promise<AccountRoutines> {
  const fetched = [];
  let page = 1;
  let pageCount = 1;
  do {
    const res = await client.getRoutines(page);
    fetched.push(...(res.routines ?? []));
    // page_count is a page total, not an item total (see hevy-api).
    pageCount = res.page_count || 1;
    if (pageCount > MAX_PAGES) {
      throw new UserFacingError(
        `Hevy reported ${pageCount} pages of routines (max ${MAX_PAGES}); the list was not loaded.`,
      );
    }
    page += 1;
  } while (page <= pageCount);

  // One query for the links (joined to their plans), one for the training
  // history of every routine at once, and one paged read for folder names —
  // never anything per routine.
  const [links, activity, folders] = await Promise.all([
    db
      .select({
        planId: syncLinks.planId,
        dayIndex: syncLinks.dayIndex,
        hevyRoutineId: syncLinks.hevyRoutineId,
        planDoc: plans.plan,
      })
      .from(syncLinks)
      .leftJoin(plans, eq(syncLinks.planId, plans.id)),
    getRoutineActivity(fetched.map((routine) => routine.id)),
    // A folder-name failure costs a grouping header, not the page.
    folderTitles(client).catch(() => new Map<number, string>()),
  ]);

  const byRoutineId = new Map(links.map((link) => [link.hevyRoutineId, link]));

  const routines: AccountRoutine[] = fetched.map((routine) => {
    const link = byRoutineId.get(routine.id);
    const trained = activity.get(routine.id);
    const folderId = routine.folder_id ?? null;
    return {
      hevyId: routine.id,
      title: routine.title,
      exerciseCount: routine.exercises?.length ?? 0,
      folderId,
      folderTitle: folderId === null ? null : (folders.get(folderId) ?? null),
      exercises: (routine.exercises ?? []).map(
        (exercise) => exercise.title ?? exercise.exercise_template_id,
      ),
      planId: link?.planId ?? null,
      planTitle: link?.planDoc?.title ?? null,
      day: link ? link.dayIndex + 1 : null,
      lastPerformedAt: trained?.lastPerformedAt ?? null,
      sessionCount: trained?.sessionCount ?? 0,
    };
  });

  const linked = routines.filter((routine) => routine.planId !== null).length;
  return {
    routines,
    linked,
    foreign: routines.length - linked,
    trained: routines.filter((routine) => routine.sessionCount > 0).length,
  };
}
