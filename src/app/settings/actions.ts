"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { requireIdentity } from "@/lib/auth/guard";
import { refreshCatalog } from "@/lib/hevy/catalog";
import { HevyClient } from "@/lib/hevy/client";
import { describeHevyError } from "@/lib/hevy/errors";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";
import { clearHevyApiKey, normalizeHevyApiKey, setHevyApiKey } from "@/lib/settings";

// Server actions for the settings page.
//
// SECURITY: these return only ActionState — a status and a human message. The
// API key itself is never part of a return value, and never appears in a thrown
// error or a log line. Every failure goes through describeHevyError, which
// refuses to pass an arbitrary Error.message back to the browser.

/**
 * Validates the submitted key against Hevy BEFORE storing it, so a typo can
 * never be persisted as a working configuration.
 */
export async function saveHevyKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Without this, an unauthenticated POST could REPLACE the owner's stored Hevy
  // key with the attacker's — quietly redirecting every later sync.
  await requireIdentity();

  let key: string;
  try {
    // Shape-check FIRST: a malformed key must never reach the fetch layer,
    // which rejects it with the whole value quoted in the exception message.
    key = normalizeHevyApiKey(String(formData.get("apiKey") ?? ""));
  } catch (error) {
    return errorState(describeHevyError(error, "auth", "Enter an API key."));
  }

  try {
    const { data } = await new HevyClient(key).getUserInfo();
    await setHevyApiKey(key);
    revalidatePath("/settings");
    return successState(`Connected as ${data.name}. Key saved.`);
  } catch (error) {
    return errorState(describeHevyError(error, "auth", "Could not reach Hevy."));
  }
}

export async function testConnectionAction(): Promise<ActionState> {
  await requireIdentity();

  const client = await getHevyClient();
  if (!client) return errorState(NO_KEY_MESSAGE);

  try {
    const { data } = await client.getUserInfo();
    return successState(`Connected as ${data.name}.`);
  } catch (error) {
    return errorState(describeHevyError(error, "auth", "Could not reach Hevy."));
  }
}

export async function clearHevyKeyAction(): Promise<ActionState> {
  await requireIdentity();

  try {
    await clearHevyApiKey();
  } catch (error) {
    // Without this the rejection escapes ActionButton's transition and the user
    // gets a full-page error instead of an inline message.
    return errorState(describeHevyError(error, "auth", "Could not remove the stored key."));
  }
  revalidatePath("/settings");
  return successState("Stored key removed.");
}

/**
 * Pulls the whole exercise-template library into the local cache. Slow by
 * nature (one request per 100 templates) — the UI shows a pending state.
 */
export async function refreshCatalogAction(): Promise<ActionState> {
  await requireIdentity();

  const client = await getHevyClient();
  if (!client) return errorState(NO_KEY_MESSAGE);

  try {
    const count = await refreshCatalog(client);
    revalidatePath("/settings");
    revalidatePath("/plans/new");
    return successState(`Cached ${count} exercises.`);
  } catch (error) {
    return errorState(describeHevyError(error, "read", "Catalog refresh failed."));
  }
}
