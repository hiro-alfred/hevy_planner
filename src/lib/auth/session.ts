import "server-only";
import { open, seal, SecretBoxError } from "@/lib/secret-box";
import type { AuthProvider, Identity } from "./authorize";

// The session token: an encrypted, self-contained cookie value.
//
// Deliberately NOT a sessions table, and the reasoning is worth keeping. A
// database session buys server-side revocation and a device list. This app has
// exactly one user, so "log out my other devices" is answered by rotating
// AUTH_SESSION_SECRET, which invalidates every token ever issued in one
// restart. Against that, a table would put a database round trip in front of
// every page render and every server action, on a box whose database has
// already been the project's most fragile dependency. Migration 0003 was
// offered and is not needed.
//
// Encrypted rather than merely signed: the payload carries the owner's email
// address, and a signed-but-readable cookie would hand it to anything that can
// read the jar. AES-256-GCM authenticates as a side effect of decrypting, so
// this costs nothing over an HMAC.
//
// The key is AUTH_SESSION_SECRET — its OWN secret, never SETTINGS_ENCRYPTION_KEY.
// Sharing one would mean rotating the Hevy key's encryption also logged everyone
// out, and would let a token forged from one subsystem's key open the other's.

export const SESSION_COOKIE = "hevy_planner_session";

/** GCM additional authenticated data: binds a token to this purpose alone. */
const CONTEXT = "auth:session:v1";

const VERSION = 1;

/** Short-lived cookie holding the PKCE verifier + state between the two legs. */
export const OAUTH_STATE_COOKIE = "hevy_planner_oauth";
const OAUTH_CONTEXT = "auth:oauth-state:v1";
/** Ten minutes is longer than any honest trip through Google's consent screen. */
export const OAUTH_STATE_TTL_SECONDS = 600;

/**
 * Wire shape. Single-letter keys because this is base64 in a cookie header on
 * every request, and the long form buys nothing a comment cannot.
 */
interface SessionPayload {
  v: number;
  p: AuthProvider;
  s: string;
  e: string | null;
  l: string;
  /** Unix seconds. */
  iat: number;
  exp: number;
}

export interface SessionCookieOptions {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
}

/**
 * Cookie attributes.
 *
 * `SameSite=Lax` rather than Strict: Strict would drop the cookie on the
 * top-level navigation Google performs back to the callback, so the user would
 * land logged out immediately after logging in. Lax still withholds the cookie
 * from cross-site POSTs, which is the case that matters for server actions.
 */
export function sessionCookieOptions(secure: boolean, maxAge: number): SessionCookieOptions {
  return { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge };
}

/** Mints a token for `identity`, valid for `ttlSeconds`. */
export function createSessionToken(
  identity: Identity,
  key: Buffer,
  ttlSeconds: number,
  now: number = Date.now(),
): string {
  const issued = Math.floor(now / 1000);
  const payload: SessionPayload = {
    v: VERSION,
    p: identity.provider,
    s: identity.subject,
    e: identity.email,
    l: identity.label,
    iat: issued,
    exp: issued + ttlSeconds,
  };
  return seal(JSON.stringify(payload), CONTEXT, key);
}

/**
 * Opens a token, returning the identity or null.
 *
 * Null for EVERY failure — wrong key, tampered ciphertext, expired, malformed,
 * or a version this build does not know. Callers get one boolean question to
 * answer and cannot accidentally treat a partially-valid token as usable.
 * Nothing here throws, because this runs in the proxy on every request and an
 * exception there is a 500 on a page that should have been a redirect to login.
 */
export function readSessionToken(
  token: string | undefined,
  key: Buffer,
  now: number = Date.now(),
): Identity | null {
  if (!token) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(open(token, CONTEXT, key)) as SessionPayload;
  } catch (error) {
    // A SecretBoxError is the ordinary case: an old cookie after a secret
    // rotation, or a forgery. Neither deserves a log line on every request.
    if (!(error instanceof SecretBoxError) && !(error instanceof SyntaxError)) throw error;
    return null;
  }

  if (payload?.v !== VERSION) return null;
  if (typeof payload.exp !== "number" || payload.exp <= Math.floor(now / 1000)) return null;
  if (typeof payload.s !== "string" || !payload.s) return null;
  if (payload.p !== "google" && payload.p !== "hevy-key") return null;

  return {
    provider: payload.p,
    subject: payload.s,
    email: typeof payload.e === "string" ? payload.e : null,
    label: typeof payload.l === "string" && payload.l ? payload.l : payload.s,
  };
}

/** What the login leg stashes so the callback can finish the exchange. */
export interface OAuthHandshake {
  state: string;
  verifier: string;
  nonce: string;
  /** Where to send the browser after a successful login. Always a local path. */
  next: string;
  exp: number;
}

export function sealHandshake(
  handshake: Omit<OAuthHandshake, "exp">,
  key: Buffer,
  now: number = Date.now(),
): string {
  const withExpiry: OAuthHandshake = {
    ...handshake,
    exp: Math.floor(now / 1000) + OAUTH_STATE_TTL_SECONDS,
  };
  return seal(JSON.stringify(withExpiry), OAUTH_CONTEXT, key);
}

export function openHandshake(
  sealed: string | undefined,
  key: Buffer,
  now: number = Date.now(),
): OAuthHandshake | null {
  if (!sealed) return null;
  try {
    const handshake = JSON.parse(open(sealed, OAUTH_CONTEXT, key)) as OAuthHandshake;
    if (typeof handshake?.exp !== "number" || handshake.exp <= Math.floor(now / 1000)) return null;
    if (!handshake.state || !handshake.verifier || !handshake.nonce) return null;
    return handshake;
  } catch (error) {
    if (!(error instanceof SecretBoxError) && !(error instanceof SyntaxError)) throw error;
    return null;
  }
}
