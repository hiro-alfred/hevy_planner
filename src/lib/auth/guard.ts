import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { authConfig } from "./config";
import type { Identity } from "./authorize";
import { LOGIN_PATH } from "./paths";
import {
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./session";

// The gate, as seen from inside the app: pages, server actions and route
// handlers all ask here.
//
// WHY THIS EXISTS WHEN THERE IS ALREADY A PROXY. Because the proxy cannot be
// the whole answer, and Next's own documentation says so outright: server
// functions "are handled as POST requests to the route where they are used, so
// a Proxy matcher that excludes a path will also skip Server Function calls on
// that path", and "a matcher change or a refactor that moves a Server Function
// to a different route can silently remove Proxy coverage."
//
// Worse than a matcher slip: actions are dispatched by action ID, and the ID
// travels in a header, not the path. A POST carrying any action's ID aimed at a
// PUBLIC path — /login is public, it has to be — reaches that action without
// ever passing a protected route. The proxy cannot tell that request from a
// legitimate login submission, because the ID is opaque to it.
//
// So the proxy is the coarse gate that keeps unauthenticated traffic off every
// page, and this module is the one that actually protects mutations. Every
// server action calls requireIdentity() as its FIRST statement.

/** Shown when a session is missing or has expired. Carries no detail. */
export const SESSION_REQUIRED_MESSAGE = "Your session has expired — sign in again.";

/**
 * The identity behind the current request, or null.
 *
 * `cache()` memoises this for the duration of one render pass, so a page, its
 * nested components and the header decrypt the cookie once between them rather
 * than once each.
 */
export const currentIdentity = cache(async (): Promise<Identity | null> => {
  const result = authConfig();

  // A broken configuration is never treated as "no session" — that would turn a
  // typo in AUTH_SESSION_SECRET into an app that merely redirects to a login
  // page it can never satisfy. The proxy answers 503 first; this throw is what
  // stops a render that somehow got past it.
  if (!result.ok) {
    throw new Error(`Auth is not configured: ${result.problems.join(" ")}`);
  }

  const { config } = result;
  if (config.mode === "disabled") return DEV_IDENTITY;

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return readSessionToken(token, config.sessionKey!);
});

/**
 * The stand-in identity used when AUTH_DISABLED=true.
 *
 * Named so it is unmistakable in any log line or UI it reaches — if this ever
 * shows up in the header of something reachable from outside a laptop, the
 * deployment is wrong. readAuthConfig refuses AUTH_DISABLED under
 * NODE_ENV=production for exactly that reason.
 */
const DEV_IDENTITY: Identity = {
  provider: "hevy-key",
  subject: "auth-disabled",
  email: null,
  label: "AUTH DISABLED",
};

/**
 * Demands a session, or sends the browser to the login page.
 *
 * Use as the FIRST statement of every server action and every protected page —
 * before any try/catch, because `redirect()` signals by throwing and a
 * surrounding catch would swallow it into an error message instead of a
 * redirect.
 *
 * `redirect()` in a server action returns a redirect the client router follows,
 * so a click made after the session expired lands on the login form rather than
 * failing with an opaque error.
 */
export async function requireIdentity(): Promise<Identity> {
  const identity = await currentIdentity();
  if (!identity) redirect(LOGIN_PATH);
  return identity;
}

/** Route-handler flavour: no redirect, just the answer. */
export async function identityOr401(): Promise<Identity | Response> {
  const identity = await currentIdentity();
  return identity ?? new Response("Unauthorized", { status: 401 });
}

/** True when the login UI should be shown at all (never under AUTH_DISABLED). */
export function authIsDisabled(): boolean {
  const result = authConfig();
  return result.ok && result.config.mode === "disabled";
}

/**
 * Issues the session cookie. Callable only from a server action or route
 * handler — a server component render cannot set cookies.
 */
export async function startSession(token: string): Promise<void> {
  const result = authConfig();
  if (!result.ok) throw new Error("Cannot start a session: auth is not configured.");

  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    token,
    sessionCookieOptions(result.config.secureCookies, result.config.sessionTtlSeconds),
  );
}

/**
 * Clears the session cookie.
 *
 * Note what signing out does NOT do under the Hevy-key gate: it cannot revoke
 * the pasted key, because the key is the credential and the app has no way to
 * rotate someone's Hevy key. Rotate it in the Hevy web app to truly revoke.
 */
export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
