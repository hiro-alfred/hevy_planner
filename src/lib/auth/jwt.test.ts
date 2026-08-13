import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IdTokenError, resetJwksCache, verifyIdToken, type Jwk } from "./jwt";

// Google's half of the login, proven WITHOUT a Google account.
//
// The point of injecting the JWKS fetcher: a locally generated RSA keypair
// stands in for Google's signing key, so every branch — good token, wrong
// audience, expired, replayed nonce, alg confusion, forged signature, key
// rotation — is exercised in CI. Nothing about this flow has to wait on the
// owner creating an OAuth client to be known-good.

const ISSUER = "https://accounts.google.com";
const AUDIENCE = "test-client-id.apps.googleusercontent.com";
const NONCE = "nonce-from-the-handshake";

function makeKeypair(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: "jwk" }) as Jwk), kid, alg: "RS256", use: "sig" };
  return { privateKey, jwk };
}

const GOOGLE = makeKeypair("google-key-1");
const ATTACKER = makeKeypair("google-key-1"); // same kid, different key

function validClaims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: "1234567890",
    email: "owner@example.com",
    email_verified: true,
    nonce: NONCE,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

function sign(
  claims: Record<string, unknown>,
  key: KeyObject = GOOGLE.privateKey,
  header: Record<string, unknown> = { alg: "RS256", kid: "google-key-1" },
): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${signer.sign(key).toString("base64url")}`;
}

/** An unsigned token, as an `alg: none` attacker would present it. */
function unsigned(claims: Record<string, unknown>): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.`;
}

const jwks = (...keys: Jwk[]) => vi.fn(async () => ({ keys }));

function verify(token: string, fetchJwks = jwks(GOOGLE.jwk), nonce = NONCE) {
  return verifyIdToken(token, { issuers: [ISSUER], audience: AUDIENCE, nonce, fetchJwks });
}

beforeEach(() => {
  // The JWKS cache is module-level and would otherwise leak between tests.
  resetJwksCache();
});

describe("verifyIdToken", () => {
  it("accepts a correctly signed token and returns its claims", async () => {
    const claims = await verify(sign(validClaims()));

    expect(claims.sub).toBe("1234567890");
    expect(claims.email).toBe("owner@example.com");
    expect(claims.email_verified).toBe(true);
  });

  it("rejects a token signed by a DIFFERENT key that claims the same kid", async () => {
    // The forgery that matters: the attacker controls the token entirely except
    // for the private key.
    await expect(verify(sign(validClaims(), ATTACKER.privateKey))).rejects.toThrow(
      /signature does not verify/,
    );
  });

  it("rejects an `alg: none` token outright", async () => {
    // Classic JWT break. RS256 is pinned by the verifier, never read from the
    // token, so the signature can never be optional.
    await expect(verify(unsigned(validClaims()))).rejects.toThrow(/alg must be RS256/);
  });

  it("rejects an HS256 token, so the public key can never be used as a shared secret", async () => {
    const encode = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const token = `${encode({ alg: "HS256" })}.${encode(validClaims())}.c2ln`;

    await expect(verify(token)).rejects.toThrow(IdTokenError);
  });

  it("rejects a token minted for another client (wrong aud)", async () => {
    await expect(verify(sign(validClaims({ aud: "someone-elses-client" })))).rejects.toThrow(
      /audience is not this client/,
    );
  });

  it("rejects a token from an unexpected issuer", async () => {
    await expect(verify(sign(validClaims({ iss: "https://evil.example" })))).rejects.toThrow(
      /issuer/,
    );
  });

  it("rejects an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 7200;
    await expect(verify(sign(validClaims({ exp: past, iat: past - 60 })))).rejects.toThrow(
      /expired/,
    );
  });

  it("rejects a REPLAYED token whose nonce belongs to another login attempt", async () => {
    await expect(
      verify(sign(validClaims({ nonce: "a-nonce-from-somewhere-else" }))),
    ).rejects.toThrow(/nonce/);
  });

  it("rejects a token carrying no nonce at all", async () => {
    const claims = validClaims();
    delete (claims as Record<string, unknown>).nonce;
    await expect(verify(sign(claims))).rejects.toThrow(/nonce/);
  });

  it("accepts the bare `accounts.google.com` issuer spelling too", async () => {
    const token = sign(validClaims({ iss: "accounts.google.com" }));
    const claims = await verifyIdToken(token, {
      issuers: ["https://accounts.google.com", "accounts.google.com"],
      audience: AUDIENCE,
      nonce: NONCE,
      fetchJwks: jwks(GOOGLE.jwk),
    });

    expect(claims.sub).toBe("1234567890");
  });

  it("tolerates small clock skew rather than failing a just-expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    // 30s past expiry, inside the 60s allowance — a drifted self-hosted clock
    // must not present as an unexplainable login failure.
    const claims = await verify(sign(validClaims({ exp: now - 30 })));
    expect(claims.sub).toBe("1234567890");
  });

  it("refetches the JWKS once when the kid is unknown, so key rotation self-heals", async () => {
    const rotated = makeKeypair("google-key-2");
    const fetcher = vi
      .fn<() => Promise<{ keys: Jwk[] }>>()
      .mockResolvedValueOnce({ keys: [GOOGLE.jwk] })
      .mockResolvedValueOnce({ keys: [GOOGLE.jwk, rotated.jwk] });

    const token = sign(validClaims(), rotated.privateKey, { alg: "RS256", kid: "google-key-2" });
    const claims = await verifyIdToken(token, {
      issuers: [ISSUER],
      audience: AUDIENCE,
      nonce: NONCE,
      fetchJwks: fetcher,
    });

    expect(claims.sub).toBe("1234567890");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("gives up after one refetch instead of hammering the JWKS endpoint", async () => {
    const fetcher = jwks(GOOGLE.jwk);
    const token = sign(validClaims(), GOOGLE.privateKey, { alg: "RS256", kid: "never-existed" });

    await expect(
      verifyIdToken(token, {
        issuers: [ISSUER],
        audience: AUDIENCE,
        nonce: NONCE,
        fetchJwks: fetcher,
      }),
    ).rejects.toThrow(/No JWKS key matches/);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects structurally broken tokens without throwing something unexpected", async () => {
    for (const junk of ["", "a", "a.b", "not.a.jwt"]) {
      await expect(verify(junk)).rejects.toBeInstanceOf(IdTokenError);
    }
  });
});
