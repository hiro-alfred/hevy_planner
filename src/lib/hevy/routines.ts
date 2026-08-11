import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { plans, syncLinks } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";
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
  /** The plan that owns this routine, if this app created it. */
  planId: number | null;
  planTitle: string | null;
  /** 1-based day number within that plan. */
  day: number | null;
}

export interface AccountRoutines {
  routines: AccountRoutine[];
  /** Created by this app and still owned by a plan. */
  linked: number;
  /** Everything else: made in the Hevy app, or orphaned by a deleted plan. */
  foreign: number;
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

  // Two queries total: the links, and the plans they belong to.
  const links = await db
    .select({
      planId: syncLinks.planId,
      dayIndex: syncLinks.dayIndex,
      hevyRoutineId: syncLinks.hevyRoutineId,
      planDoc: plans.plan,
    })
    .from(syncLinks)
    .leftJoin(plans, eq(syncLinks.planId, plans.id));

  const byRoutineId = new Map(links.map((link) => [link.hevyRoutineId, link]));

  const routines: AccountRoutine[] = fetched.map((routine) => {
    const link = byRoutineId.get(routine.id);
    return {
      hevyId: routine.id,
      title: routine.title,
      exerciseCount: routine.exercises?.length ?? 0,
      folderId: routine.folder_id ?? null,
      planId: link?.planId ?? null,
      planTitle: link?.planDoc?.title ?? null,
      day: link ? link.dayIndex + 1 : null,
    };
  });

  const linked = routines.filter((routine) => routine.planId !== null).length;
  return { routines, linked, foreign: routines.length - linked };
}
