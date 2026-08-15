import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { traineeProfile } from "@/lib/db/schema";
import {
  isEmptyProfile,
  savedProfileSchema,
  type SavedProfile,
} from "@/lib/planner/profile-defaults";

// Reading and writing the standing trainee profile.
//
// Single-tenant, like every other table in this schema: there is no user id on
// `plans`, `workouts` or `settings` either, so a profile keyed on identity here
// would be the only tenant-aware table in the app — an inconsistency that reads
// as "this one is done" and would be missed by the sweep that does the other 49
// query sites. See the warning callout in knowledge/decisions/app-authentication.md.
// When that sweep happens, this file changes in exactly the same way as the rest.

/** The singleton row. There is one trainee until open signup lands. */
export const PROFILE_ROW_ID = 1;

/**
 * The saved profile, or null when none has been saved.
 *
 * Parsed on the way OUT as well as in. A stored document can be older than the
 * schema — `savedProfileSchema` has already tracked planRequestSchema through
 * two rounds of field changes — and an unparsed read would hand the plan form a
 * `split` value its `<select>` no longer offers, which renders as a silently
 * blank control rather than an error.
 */
export async function getSavedProfile(): Promise<SavedProfile | null> {
  const [row] = await db
    .select({ profile: traineeProfile.profile })
    .from(traineeProfile)
    .where(eq(traineeProfile.id, PROFILE_ROW_ID))
    .limit(1);
  if (!row) return null;

  const parsed = savedProfileSchema.safeParse(row.profile);
  if (!parsed.success) {
    // Never fatal. A profile is a convenience: losing it costs the user a
    // re-typed form, while throwing here would take down /plans/new as well.
    console.error("[profile] stored profile does not parse; ignoring it:", parsed.error.message);
    return null;
  }
  return isEmptyProfile(parsed.data) ? null : parsed.data;
}

export interface ProfileStatus {
  profile: SavedProfile | null;
  updatedAt: string | null;
}

/** The profile plus when it was last touched — the page shows both. */
export async function getProfileStatus(): Promise<ProfileStatus> {
  const [row] = await db
    .select({ profile: traineeProfile.profile, updatedAt: traineeProfile.updatedAt })
    .from(traineeProfile)
    .where(eq(traineeProfile.id, PROFILE_ROW_ID))
    .limit(1);
  if (!row) return { profile: null, updatedAt: null };

  const parsed = savedProfileSchema.safeParse(row.profile);
  if (!parsed.success || isEmptyProfile(parsed.data)) {
    return { profile: null, updatedAt: row.updatedAt };
  }
  return { profile: parsed.data, updatedAt: row.updatedAt };
}

/**
 * Stores the profile, replacing whatever was there.
 *
 * Whole-document replacement rather than a merge, and that is the point: the
 * form posts every field on every save, so a field the user CLEARED arrives as
 * absent. A merge would make blanking a bodyweight impossible — the old number
 * would survive every attempt to remove it, which is the worst possible
 * behaviour for a value that feeds suggested loads.
 *
 * An all-empty submission deletes the row instead of storing a document that
 * pre-fills nothing while the page insists a profile exists.
 */
export async function saveProfile(profile: SavedProfile): Promise<void> {
  if (isEmptyProfile(profile)) {
    await clearProfile();
    return;
  }

  const updatedAt = new Date().toISOString();
  // MariaDB upsert: no conflict target to name, the clause fires on the only
  // unique key this table has. Same shape as settings.setSetting.
  await db
    .insert(traineeProfile)
    .values({ id: PROFILE_ROW_ID, profile, updatedAt })
    .onDuplicateKeyUpdate({ set: { profile, updatedAt } });
}

export async function clearProfile(): Promise<void> {
  await db.delete(traineeProfile).where(eq(traineeProfile.id, PROFILE_ROW_ID));
}
