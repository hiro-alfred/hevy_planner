import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { buildAuthorizeUrl, createHandshakeSecrets } from "@/lib/auth/google";
import { LOGIN_PATH, safeNextPath } from "@/lib/auth/paths";
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
  sealHandshake,
  sessionCookieOptions,
} from "@/lib/auth/session";

// Leg 1 of Google sign-in: mint the handshake, stash it, bounce to Google.
//
// A GET route handler rather than a server action so the login page can be a
// plain <a href>. Two things have to happen atomically here — generating the
// state/nonce/verifier and putting them somewhere the callback can find them —
// and a redirect response that also sets a cookie does exactly that.
//
// The handshake is kept in a short-lived ENCRYPTED cookie rather than in server
// memory or a table. Memory would break the moment the app runs more than one
// process; a table would need migration 0003 to hold rows that are worthless
// after ten minutes. The cookie is sealed with the session secret, so its
// contents are neither readable nor forgeable by the browser holding it.

export const dynamic = "force-dynamic";

export function GET(request: NextRequest): NextResponse {
  const result = authConfig();
  if (!result.ok || result.config.mode !== "google" || !result.config.google) {
    return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=config`, request.nextUrl));
  }
  const { config } = result;

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const secrets = createHandshakeSecrets();

  const response = NextResponse.redirect(buildAuthorizeUrl(config.google!, secrets));
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    sealHandshake({ ...secrets, next }, config.sessionKey!),
    sessionCookieOptions(config.secureCookies, OAUTH_STATE_TTL_SECONDS),
  );
  // Never let an intermediary keep a response that carries a one-shot nonce.
  response.headers.set("cache-control", "no-store");
  return response;
}
