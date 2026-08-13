import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { GoogleOptions } from "./config";
import { verifyIdToken, type JwtClaims } from "./jwt";

// Google OIDC, authorization-code flow with PKCE. No SDK.
//
// Everything here is two fetches and a hash; an auth library would earn its
// place by handling a dozen providers, and this app has one. The parts that
// actually protect the flow are named where they are used: `state` (CSRF on the
// callback), `nonce` (replay of a token minted for another attempt), and the
// PKCE `code_verifier` (an intercepted authorization code is useless without
// it). PKCE is not skipped just because this is a confidential client with a
// secret — it costs one hash and closes code interception at the redirect.

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

/** Google issues both spellings; both are legitimate for its tokens. */
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"] as const;

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

/** 32 bytes of CSPRNG, base64url — the shape PKCE and state both want. */
function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface HandshakeSecrets {
  state: string;
  verifier: string;
  nonce: string;
}

export function createHandshakeSecrets(): HandshakeSecrets {
  return { state: randomToken(), verifier: randomToken(), nonce: randomToken() };
}

/** S256 code challenge. Google supports it, so `plain` is never offered. */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * The URL to send the browser to.
 *
 * `prompt=select_account` rather than the default: on a machine already signed
 * in to a non-allowlisted Google account, the default silently reuses it and the
 * owner sees a denial with no way to switch. Scope is `openid email` only —
 * `profile` would pull a name and picture this app has no use for.
 */
export function buildAuthorizeUrl(google: GoogleOptions, secrets: HandshakeSecrets): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: "code",
    scope: "openid email",
    state: secrets.state,
    nonce: secrets.nonce,
    code_challenge: codeChallenge(secrets.verifier),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

interface TokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

/**
 * Trades the authorization code for an id_token.
 *
 * Back-channel: the client secret only ever travels on this server-to-server
 * request, never through the browser.
 */
export async function exchangeCodeForIdToken(
  code: string,
  verifier: string,
  google: GoogleOptions,
): Promise<string> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: google.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }).toString(),
  });

  const body = (await response.json().catch(() => null)) as TokenResponse | null;

  if (!response.ok) {
    // Google's error_description is a fixed enum ("invalid_grant", "redirect_uri
    // mismatch"), not an echo of anything submitted, so it is safe to surface —
    // and it is the single most useful string when a redirect URI is one
    // character off in the Cloud console.
    throw new GoogleAuthError(
      `Google rejected the code exchange (${response.status}): ${
        body?.error_description ?? body?.error ?? response.statusText
      }`,
    );
  }
  if (!body?.id_token) throw new GoogleAuthError("Google returned no id_token.");
  return body.id_token;
}

async function fetchGoogleJwks(): Promise<{ keys: never[] }> {
  const response = await fetch(JWKS_URI);
  if (!response.ok) {
    throw new GoogleAuthError(`Could not fetch Google's signing keys (${response.status}).`);
  }
  return (await response.json()) as { keys: never[] };
}

/** Verifies the id_token against Google's live JWKS. */
export function verifyGoogleIdToken(
  idToken: string,
  google: GoogleOptions,
  nonce: string,
): Promise<JwtClaims> {
  return verifyIdToken(idToken, {
    issuers: GOOGLE_ISSUERS,
    audience: google.clientId,
    nonce,
    fetchJwks: fetchGoogleJwks,
  });
}
