// Which paths are reachable without a session, and how a post-login redirect is
// sanitised. Pure path logic, no secrets — imported by the proxy, the login page
// and the OAuth callback so all three agree on one list.

import { NextResponse } from "next/server";
import { GOOGLE_CALLBACK_PATH } from "./config";

export const LOGIN_PATH = "/login";

/**
 * The complete public surface. Everything not listed here needs a session.
 *
 * Deliberately a closed list rather than a pattern, and deliberately short:
 *
 *   /login                      the form itself, and the POST that submits it
 *   /api/auth/callback/google   Google redirects the browser here; it cannot
 *                               carry a session because the session is what it
 *                               is in the middle of creating
 *   /api/auth/start             begins the OAuth leg (a GET, so a plain link
 *                               works without JavaScript)
 *
 * NOT public: static assets are excluded by the proxy matcher instead, because
 * they are served before the app and never carry data. Nothing else is exempt —
 * no health endpoint, no favicon carve-out beyond the matcher, and above all no
 * blanket /api exemption, which is the usual way a gate springs a leak.
 *
 * READ THIS BEFORE ADDING AN ENTRY. A public path is not merely a readable
 * page: Next dispatches server actions by action id to whatever route path the
 * POST names, so any public path is a door every server action in the app can
 * be called through. That is why every action calls requireSession() itself
 * (see guard.ts) instead of trusting this list.
 */
export const PUBLIC_PATHS: readonly string[] = [
  LOGIN_PATH,
  GOOGLE_CALLBACK_PATH,
  "/api/auth/start",
];

export function isPublicPath(pathname: string): boolean {
  // Exact match only. A startsWith() would make "/login-as-admin" public too.
  return PUBLIC_PATHS.includes(pathname);
}

/**
 * Sanitises a post-login destination.
 *
 * An open redirect on a login page is the standard phishing primitive: a link
 * to the owner's own planner that bounces to an attacker's page after a real
 * login. Only same-origin absolute paths survive.
 *
 * "//evil.example" and "/\evil.example" are the two that look local and are
 * not — browsers read both as scheme-relative URLs — so the second character is
 * checked, not just the first.
 */
/**
 * A redirect whose `Location` is RELATIVE, resolved by the browser against the
 * request it made.
 *
 * Route handlers must not build absolute redirects from `request.nextUrl`. In a
 * route handler that URL is based on the server's BIND address, not the Host
 * header — and the Dockerfile binds `HOSTNAME=0.0.0.0`, so the browser was sent
 * to `http://0.0.0.0:3000/` after a successful Google login and got
 * ERR_ADDRESS_INVALID. (The proxy is unaffected: its `nextUrl` does follow the
 * Host header, which is why only the OAuth legs broke.)
 *
 * A relative Location sidesteps the question entirely — RFC 7231 §7.1.2 allows
 * it and every browser resolves it against the request URL, so this stays
 * correct behind a reverse proxy, on a LAN address, and under any bind host,
 * with nothing to configure. AUTH_ORIGIN is deliberately NOT used here: it is
 * the registered OAuth redirect URI, and forcing every redirect through it
 * would break the moment the app is reached by any other name.
 */
export function relativeRedirect(path: string, status: 303 | 307 = 307): NextResponse {
  // NextResponse rather than a bare Response: the OAuth legs have to set and
  // clear cookies on the redirect itself. NextResponse.redirect() is not usable
  // because it demands an absolute URL, which is the whole problem.
  return new NextResponse(null, {
    status,
    headers: { location: path, "cache-control": "no-store" },
  });
}

export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate) return "/";
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return "/";
  // Bouncing back to the login page after logging in would loop.
  if (candidate === LOGIN_PATH) return "/";
  return candidate;
}
