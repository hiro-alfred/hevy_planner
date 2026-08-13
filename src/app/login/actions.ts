"use server";

import { redirect } from "next/navigation";
import { type ActionState, errorState } from "@/lib/action-state";
import { DENIED_MESSAGE } from "@/lib/auth/authorize";
import { authConfig } from "@/lib/auth/config";
import { endSession, startSession } from "@/lib/auth/guard";
import { authenticateWithHevyKey } from "@/lib/auth/hevy-identity";
import { LOGIN_PATH, safeNextPath } from "@/lib/auth/paths";
import { createSessionToken } from "@/lib/auth/session";
import { UserFacingError } from "@/lib/errors";
import { describeHevyError } from "@/lib/hevy/errors";

// Login and logout.
//
// These live on a PUBLIC path, which makes them the only actions in the app
// that may run without a session — so they are also the ones that have to be
// most careful about what they say.

/**
 * The Hevy-key gate's login.
 *
 * Every allowlist refusal returns the one DENIED_MESSAGE, so the reply cannot be
 * used to enumerate which Hevy accounts are listed; the specific reason goes to
 * the server log.
 *
 * A malformed or Hevy-rejected key DOES get a distinct message, and that is a
 * considered choice rather than an oversight: whether a key is valid is
 * something anyone holding it can already learn by calling Hevy directly, so
 * hiding it buys nothing and costs the owner the one error message that tells
 * them they fat-fingered a paste.
 */
export async function hevyKeyLoginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = authConfig();
  if (!result.ok) return errorState("Authentication is not configured on this server.");
  const { config } = result;

  if (config.mode !== "hevy-key") {
    return errorState("This server does not accept key sign-in.");
  }

  const next = safeNextPath(String(formData.get("next") ?? "/"));

  let decision;
  try {
    decision = await authenticateWithHevyKey(
      String(formData.get("apiKey") ?? ""),
      config.allowedHevyUserIds,
    );
  } catch (error) {
    if (error instanceof UserFacingError) return errorState(error.message);
    // describeHevyError refuses to pass an arbitrary Error.message back, which
    // matters doubly here: the message could otherwise quote the submitted key.
    return errorState(describeHevyError(error, "auth", DENIED_MESSAGE));
  }

  if (!decision.allowed) {
    console.warn(`[auth] hevy-key sign-in refused: ${decision.reason}`);
    return errorState(DENIED_MESSAGE);
  }

  await startSession(
    createSessionToken(decision.identity, config.sessionKey!, config.sessionTtlSeconds),
  );
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}
