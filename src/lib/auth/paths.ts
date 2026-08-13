// Which paths are reachable without a session, and how a post-login redirect is
// sanitised. Pure path logic, no secrets — imported by the proxy, the login page
// and the OAuth callback so all three agree on one list.

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
export function safeNextPath(candidate: string | null | undefined): string {
  if (!candidate) return "/";
  if (!candidate.startsWith("/")) return "/";
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return "/";
  // Bouncing back to the login page after logging in would loop.
  if (candidate === LOGIN_PATH) return "/";
  return candidate;
}
