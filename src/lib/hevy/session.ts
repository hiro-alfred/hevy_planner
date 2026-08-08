import "server-only";
import { getHevyApiKey } from "@/lib/settings";
import { HevyClient } from "./client";

/**
 * Builds a HevyClient from the configured key.
 *
 * Every server action that talks to Hevy goes through here, so the key is read
 * in exactly one place and never travels as a function argument through the app.
 */
export async function getHevyClient(): Promise<HevyClient | null> {
  const key = await getHevyApiKey();
  return key ? new HevyClient(key) : null;
}

export const NO_KEY_MESSAGE = "No Hevy API key configured — add one on the settings page.";
