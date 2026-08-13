import "server-only";
import { createPublicKey, createVerify, timingSafeEqual } from "node:crypto";

// RS256 id_token verification against a JWKS, with node:crypto and nothing else.
//
// WHY VERIFY AT ALL. OpenID Connect §3.1.3.7 lets a client skip the signature
// when the token came straight from the token endpoint over TLS, which is the
// flow this app uses — so this module is, strictly, optional. It is here anyway
// because "the transport was trustworthy" is an assumption that quietly stops
// holding the moment anyone reaches for a different flow, and because the whole
// of it is ~120 lines of standard library. That is the same trade this repo
// already made in scripts/cdp-drive.mjs: a hand-rolled hundred lines beats a
// dependency whose transitive tree has to be audited forever.
//
// It also makes Google's half of the login TESTABLE without a Google account:
// the fetcher is injected, so a test generates an RSA keypair, publishes it as a
// JWKS and signs its own tokens. See jwt.test.ts.

export class IdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdTokenError";
  }
}

export interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

export interface JwtClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  [claim: string]: unknown;
}

export type JwksFetcher = () => Promise<{ keys: Jwk[] }>;

export interface VerifyOptions {
  /** Accepted `iss` values. Google uses two spellings of the same issuer. */
  issuers: readonly string[];
  /** The OAuth client id; must appear in `aud`. */
  audience: string;
  /** The nonce sent on the authorize leg. Compared in constant time. */
  nonce: string;
  fetchJwks: JwksFetcher;
  now?: number;
}

/**
 * Tolerance for `exp`/`iat`, in seconds.
 *
 * Not generosity — a self-hosted box whose clock has drifted a few seconds
 * would otherwise reject every login with an error that points nowhere near the
 * real cause. Sixty seconds is the usual figure and is far below any token
 * lifetime worth attacking.
 */
const CLOCK_SKEW_SECONDS = 60;

function decodeSegment(segment: string): Buffer {
  return Buffer.from(segment, "base64url");
}

function parseJsonSegment<T>(segment: string, what: string): T {
  try {
    return JSON.parse(decodeSegment(segment).toString("utf8")) as T;
  } catch {
    throw new IdTokenError(`id_token ${what} is not valid JSON.`);
  }
}

/** Constant-time string compare that does not leak length through timing. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

interface JwtHeader {
  alg: string;
  kid?: string;
}

/**
 * Verifies signature and claims, returning the payload.
 *
 * Order matters: the signature is checked BEFORE any claim is read, so no
 * decision is ever made on the strength of an unauthenticated field.
 */
export async function verifyIdToken(token: string, options: VerifyOptions): Promise<JwtClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new IdTokenError("id_token is not a three-part JWT.");
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];

  const header = parseJsonSegment<JwtHeader>(headerSegment, "header");

  // Pinned, not read from the token. Accepting the token's own `alg` is the
  // classic JWT break: "none" strips the signature, and an HMAC alg would have
  // the verifier treat the PUBLIC key as a shared secret anyone can sign with.
  if (header.alg !== "RS256") {
    throw new IdTokenError(`id_token alg must be RS256 (got "${header.alg}").`);
  }

  const key = await resolveKey(header.kid, options.fetchJwks);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const verifier = createVerify("RSA-SHA256");
  verifier.update(signingInput);
  verifier.end();

  if (!verifier.verify(key, decodeSegment(signatureSegment))) {
    throw new IdTokenError("id_token signature does not verify.");
  }

  const claims = parseJsonSegment<JwtClaims>(payloadSegment, "payload");
  assertClaims(claims, options);
  return claims;
}

function assertClaims(claims: JwtClaims, options: VerifyOptions): void {
  const now = Math.floor((options.now ?? Date.now()) / 1000);

  if (!options.issuers.includes(claims.iss)) {
    throw new IdTokenError(`id_token issuer "${claims.iss}" is not accepted.`);
  }

  // `aud` is a string for a single audience and an array for several.
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some((aud) => typeof aud === "string" && safeEqual(aud, options.audience))) {
    throw new IdTokenError("id_token audience is not this client.");
  }

  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS <= now) {
    throw new IdTokenError("id_token has expired.");
  }
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > now) {
    throw new IdTokenError("id_token was issued in the future — check the server clock.");
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new IdTokenError("id_token has no subject.");
  }

  // Binds this token to THIS login attempt. Without it a token captured from
  // another session of the same client would replay here.
  if (typeof claims.nonce !== "string" || !safeEqual(claims.nonce, options.nonce)) {
    throw new IdTokenError("id_token nonce does not match this login attempt.");
  }
}

interface JwksCache {
  keys: Jwk[];
  fetchedAt: number;
}

let jwksCache: JwksCache | null = null;

/** Google rotates signing keys every few days; an hour is well inside that. */
const JWKS_TTL_MS = 60 * 60 * 1000;

/**
 * Finds the signing key for `kid`, refetching once if it is unknown.
 *
 * The refetch is what makes key rotation a non-event: a token signed with a key
 * minted after the cache was filled misses, forces one fresh fetch, and
 * succeeds. Without it every rotation would lock the owner out for up to an
 * hour. `force` prevents that becoming an unbounded fetch per bad token.
 */
async function resolveKey(kid: string | undefined, fetchJwks: JwksFetcher) {
  let keys = await loadKeys(fetchJwks, false);
  let jwk = selectKey(keys, kid);

  if (!jwk) {
    keys = await loadKeys(fetchJwks, true);
    jwk = selectKey(keys, kid);
  }
  if (!jwk) throw new IdTokenError("No JWKS key matches the id_token's kid.");

  try {
    return createPublicKey({ key: jwk as never, format: "jwk" });
  } catch {
    throw new IdTokenError("JWKS key could not be parsed.");
  }
}

async function loadKeys(fetchJwks: JwksFetcher, force: boolean): Promise<Jwk[]> {
  const fresh = jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!force && fresh) return jwksCache!.keys;

  const jwks = await fetchJwks();
  if (!jwks?.keys?.length) throw new IdTokenError("JWKS response contained no keys.");
  jwksCache = { keys: jwks.keys, fetchedAt: Date.now() };
  return jwks.keys;
}

function selectKey(keys: Jwk[], kid: string | undefined): Jwk | undefined {
  const usable = keys.filter((key) => key.kty === "RSA" && (key.alg ?? "RS256") === "RS256");
  // A token without a kid is only unambiguous when the set holds one key.
  if (!kid) return usable.length === 1 ? usable[0] : undefined;
  return usable.find((key) => key.kid === kid);
}

/** Test-only: drops the memoised JWKS so a test can serve a different one. */
export function resetJwksCache(): void {
  jwksCache = null;
}
