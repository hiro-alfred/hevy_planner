import { NextResponse, type NextRequest } from "next/server";
import { decideGoogleAccess } from "@/lib/auth/authorize";
import { authConfig } from "@/lib/auth/config";
import { exchangeCodeForIdToken, verifyGoogleIdToken } from "@/lib/auth/google";
import { LOGIN_PATH, relativeRedirect } from "@/lib/auth/paths";
import {
  createSessionToken,
  OAUTH_STATE_COOKIE,
  openHandshake,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth/session";

// Leg 2 of Google sign-in: verify everything, then issue the session.
//
// Public by necessity — it is where Google sends the browser, and it cannot
// require the session it is in the middle of creating. Everything it trusts is
// therefore proven here rather than assumed:
//
//   state     matched against the sealed cookie, so a callback the owner did
//             not start (CSRF login-forcing) is refused
//   code      exchanged over the back channel with the PKCE verifier
//   id_token  RS256-verified against Google's JWKS, with iss/aud/exp checked
//   nonce     matched, so a token minted for another attempt cannot be replayed
//   email     checked against the allowlist, and required to be verified
//
// Failures redirect to the login page with a short CODE, never with text from
// the query string — reflecting a caller-supplied message onto the page is how
// a login screen becomes a phishing surface.

export const dynamic = "force-dynamic";

function fail(code: string): NextResponse {
  const response = relativeRedirect(`${LOGIN_PATH}?error=${code}`);
  // Always clear the handshake: it is one-shot, and leaving it set would let a
  // failed attempt's state be replayed.
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const result = authConfig();
  if (!result.ok || result.config.mode !== "google" || !result.config.google) {
    return fail("config");
  }
  const { config } = result;

  const handshake = openHandshake(
    request.cookies.get(OAUTH_STATE_COOKIE)?.value,
    config.sessionKey!,
  );
  if (!handshake) return fail("state");

  const params = request.nextUrl.searchParams;
  // Google reports user-side refusals here (access_denied); there is no code.
  if (params.get("error")) return fail("denied");

  const returnedState = params.get("state");
  const code = params.get("code");
  if (!code || !returnedState || returnedState !== handshake.state) return fail("state");

  let claims;
  try {
    const idToken = await exchangeCodeForIdToken(code, handshake.verifier, config.google!);
    claims = await verifyGoogleIdToken(idToken, config.google!, handshake.nonce);
  } catch (error) {
    // The detail belongs in the log, not the browser: it can name the redirect
    // URI and the client id, which is exactly what a misconfiguration report
    // needs and exactly what a visitor should not be handed.
    console.error("[auth] Google code exchange or id_token verification failed:", error);
    return fail("exchange");
  }

  const decision = decideGoogleAccess(
    { sub: claims.sub, email: claims.email, email_verified: claims.email_verified },
    config.allowedEmails,
  );
  if (!decision.allowed) {
    console.warn(
      `[auth] Google sign-in refused (${decision.reason}) for sub ${claims.sub.slice(0, 8)}…`,
    );
    return fail("denied");
  }

  const response = relativeRedirect(handshake.next);
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(decision.identity, config.sessionKey!, config.sessionTtlSeconds),
    sessionCookieOptions(config.secureCookies, config.sessionTtlSeconds),
  );
  response.cookies.delete(OAUTH_STATE_COOKIE);
  response.headers.set("cache-control", "no-store");
  return response;
}
