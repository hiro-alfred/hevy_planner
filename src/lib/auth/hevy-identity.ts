import "server-only";
import { HevyClient } from "@/lib/hevy/client";
import { normalizeHevyApiKey } from "@/lib/settings";
import { decideHevyAccess, type AccessDecision } from "./authorize";

// Provider 2: the Hevy API key used as the login credential.
//
// VERIFIED BEFORE BUILDING, as the brief asked. docs/hevy-openapi.json declares
// 14 paths, zero `oauth`/`authorize`/`/token` occurrences and no
// `securitySchemes` block; all 22 authenticated operations take a plain
// `api-key` request header. There is no Hevy OAuth to implement, so nothing
// better than a shared secret is available from this provider.
//
// CALL IT WHAT IT IS: a password gate. The "identity" proven here is possession
// of a key, and that key is a bearer credential the owner also pastes into other
// tools. Signing out cannot revoke it. It earns its place only because it needs
// no external setup and therefore works the moment the app boots — which is
// also what makes the gate itself verifiable end to end on a machine with no
// Google client. Google (google.ts) is the recommended provider.

/**
 * Exchanges a submitted key for an authorization decision.
 *
 * The key is spent on GET /v1/user/info — the cheapest authenticated call in
 * the API — purely to learn the account id behind it. It is NOT stored: this
 * function has nothing to do with the Hevy key in the settings table, and a
 * visitor logging in does not overwrite the owner's configured key. Keeping the
 * two apart is what stops a login attempt from reconfiguring the app.
 */
export async function authenticateWithHevyKey(
  submittedKey: string,
  allowedHevyUserIds: readonly string[],
): Promise<AccessDecision> {
  // Shape-check first, exactly as the settings page does: a key containing a
  // newline makes the fetch layer throw with the whole value quoted in the
  // exception message, and that message must never be constructible.
  const key = normalizeHevyApiKey(submittedKey);

  const { data } = await new HevyClient(key).getUserInfo();
  return decideHevyAccess(data.id, allowedHevyUserIds);
}
