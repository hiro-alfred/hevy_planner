"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { requireIdentity } from "@/lib/auth/guard";
import { clearProfile, saveProfile } from "@/lib/profile-store";
import { PROFILE_FORM_ERROR, parseSavedProfile } from "./profile-request";

// Server actions for the profile page.
//
// Both revalidate /plans/new as well as /profile, because that page is the
// profile's only consumer: without it, saving a bodyweight and going straight
// to build a plan would render the cached form with the old defaults, and the
// save would look like it had done nothing.

/** Which paths a profile change invalidates. Kept in one place so the two actions agree. */
const TOUCHED_PATHS = ["/profile", "/plans/new"];

export async function saveProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // FIRST statement, outside any try: redirect() signals by throwing, and a
  // surrounding catch would turn an expired session into an error message
  // instead of a trip to the login page.
  await requireIdentity();

  let profile;
  try {
    profile = parseSavedProfile(formData);
  } catch {
    // The zod issue list is not shown. Every bound here is also an HTML
    // constraint on the input, so reaching this branch means the value was
    // crafted rather than typed, and a field-by-field readout would be noise.
    return errorState(PROFILE_FORM_ERROR);
  }

  try {
    await saveProfile(profile);
  } catch (error) {
    console.error("[profile] save failed:", error);
    return errorState("Could not save your profile. The database did not accept the write.");
  }

  // Not `.forEach(revalidatePath)`: forEach passes the index as the second
  // argument, and revalidatePath's second parameter is a "layout" | "page" tag.
  TOUCHED_PATHS.forEach((path) => revalidatePath(path));
  // Says what it DOES, not that it was stored: the value of the profile is
  // entirely in what the next plan starts from.
  return successState("Saved. New plans start from this.");
}

export async function clearProfileAction(): Promise<ActionState> {
  await requireIdentity();

  try {
    await clearProfile();
  } catch (error) {
    // Without this the rejection escapes ActionButton's transition and the user
    // gets a full-page error instead of an inline message.
    console.error("[profile] clear failed:", error);
    return errorState("Could not clear your profile.");
  }

  // Not `.forEach(revalidatePath)`: forEach passes the index as the second
  // argument, and revalidatePath's second parameter is a "layout" | "page" tag.
  TOUCHED_PATHS.forEach((path) => revalidatePath(path));
  return successState("Profile cleared. New plans start from the built-in defaults again.");
}
