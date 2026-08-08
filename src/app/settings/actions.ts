"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, errorState, successState } from "@/lib/action-state";
import { refreshCatalog } from "@/lib/hevy/catalog";
import { HevyApiError, HevyClient } from "@/lib/hevy/client";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";
import { clearHevyApiKey, setHevyApiKey } from "@/lib/settings";

// Server actions for the settings page.
//
// SECURITY: these return only ActionState — a status and a human message. The
// API key itself is never part of a return value, and never appears in a thrown
// error or a log line. Failures are translated into messages built from the
// HTTP status alone.

/** Turns any thrown value into a user-safe message. Never echoes the key. */
function describeError(error: unknown, fallback: string): string {
  if (error instanceof HevyApiError) {
    if (error.status === 401 || error.status === 403) {
      return "Hevy rejected the key (401/403). Check that it is a valid Hevy Pro developer key.";
    }
    if (error.status === 429) {
      return "Hevy is rate-limiting this key. Wait a moment and try again.";
    }
    return `Hevy returned HTTP ${error.status}.`;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * Validates the submitted key against Hevy BEFORE storing it, so a typo can
 * never be persisted as a working configuration.
 */
export async function saveHevyKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const key = String(formData.get("apiKey") ?? "").trim();
  if (key === "") return errorState("Enter an API key.");

  try {
    const { data } = await new HevyClient(key).getUserInfo();
    await setHevyApiKey(key);
    revalidatePath("/settings");
    return successState(`Connected as ${data.name}. Key saved.`);
  } catch (error) {
    return errorState(describeError(error, "Could not reach Hevy."));
  }
}

export async function testConnectionAction(): Promise<ActionState> {
  const client = await getHevyClient();
  if (!client) return errorState(NO_KEY_MESSAGE);

  try {
    const { data } = await client.getUserInfo();
    return successState(`Connected as ${data.name}.`);
  } catch (error) {
    return errorState(describeError(error, "Could not reach Hevy."));
  }
}

export async function clearHevyKeyAction(): Promise<ActionState> {
  await clearHevyApiKey();
  revalidatePath("/settings");
  return successState("Stored key removed.");
}

/**
 * Pulls the whole exercise-template library into the local cache. Slow by
 * nature (one request per 100 templates) — the UI shows a pending state.
 */
export async function refreshCatalogAction(): Promise<ActionState> {
  const client = await getHevyClient();
  if (!client) return errorState(NO_KEY_MESSAGE);

  try {
    const count = await refreshCatalog(client);
    revalidatePath("/settings");
    revalidatePath("/plans/new");
    return successState(`Cached ${count} exercises.`);
  } catch (error) {
    return errorState(describeError(error, "Catalog refresh failed."));
  }
}
