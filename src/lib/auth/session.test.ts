import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Identity } from "./authorize";
import {
  createSessionToken,
  openHandshake,
  readSessionToken,
  sealHandshake,
  sessionCookieOptions,
} from "./session";

// The session token. Everything a forged, stale or corrupted cookie could look
// like has to come back as null — never as a partially-trusted identity.

const KEY = randomBytes(32);
const OTHER_KEY = randomBytes(32);
const HOUR = 3600;

const IDENTITY: Identity = {
  provider: "google",
  subject: "google-abc",
  email: "owner@example.com",
  label: "owner@example.com",
};

describe("createSessionToken / readSessionToken", () => {
  it("round-trips an identity", () => {
    const token = createSessionToken(IDENTITY, KEY, HOUR);
    expect(readSessionToken(token, KEY)).toEqual(IDENTITY);
  });

  it("returns null when there is no cookie at all", () => {
    expect(readSessionToken(undefined, KEY)).toBeNull();
    expect(readSessionToken("", KEY)).toBeNull();
  });

  it("returns null once the token has EXPIRED", () => {
    const issuedAt = Date.parse("2026-01-01T00:00:00Z");
    const token = createSessionToken(IDENTITY, KEY, HOUR, issuedAt);

    // Still good a minute before the hour is up...
    expect(readSessionToken(token, KEY, issuedAt + (HOUR - 60) * 1000)).toEqual(IDENTITY);
    // ...and dead a second after it.
    expect(readSessionToken(token, KEY, issuedAt + (HOUR + 1) * 1000)).toBeNull();
  });

  it("returns null for a token minted with a DIFFERENT secret", () => {
    // This is what makes rotating AUTH_SESSION_SECRET a working logout-everywhere.
    const token = createSessionToken(IDENTITY, OTHER_KEY, HOUR);
    expect(readSessionToken(token, KEY)).toBeNull();
  });

  it("returns null when the ciphertext is TAMPERED with", () => {
    const token = createSessionToken(IDENTITY, KEY, HOUR);
    const [iv, tag, ciphertext] = token.split(".") as [string, string, string];

    // Flip a byte in the ciphertext. GCM's tag makes this detectable, which is
    // the whole reason the token is authenticated rather than merely encrypted.
    const bytes = Buffer.from(ciphertext, "base64url");
    bytes[0] = bytes[0]! ^ 0xff;
    const forged = [iv, tag, bytes.toString("base64url")].join(".");

    expect(forged).not.toBe(token);
    expect(readSessionToken(forged, KEY)).toBeNull();
  });

  it("returns null when the auth TAG is tampered with", () => {
    const token = createSessionToken(IDENTITY, KEY, HOUR);
    const [iv, tag, ciphertext] = token.split(".") as [string, string, string];
    const bytes = Buffer.from(tag, "base64url");
    bytes[0] = bytes[0]! ^ 0xff;

    expect(readSessionToken([iv, bytes.toString("base64url"), ciphertext].join("."), KEY)).toBeNull();
  });

  it("returns null for structurally malformed values instead of throwing", () => {
    // These arrive from the open internet; a throw here would be a 500 on the
    // proxy for every request carrying a junk cookie.
    for (const junk of ["", "not-a-token", "a.b", "a.b.c.d", "....", "%%%.%%%.%%%"]) {
      expect(() => readSessionToken(junk, KEY)).not.toThrow();
      expect(readSessionToken(junk, KEY)).toBeNull();
    }
  });

  it("refuses a token sealed for a different PURPOSE", () => {
    // The handshake cookie is sealed with the same key but different AAD, so it
    // cannot be presented as a session.
    const handshake = sealHandshake(
      { state: "s", verifier: "v", nonce: "n", next: "/" },
      KEY,
    );
    expect(readSessionToken(handshake, KEY)).toBeNull();
  });

  it("keeps the token opaque — no claim is readable from the cookie value", () => {
    const token = createSessionToken(IDENTITY, KEY, HOUR);
    const decoded = Buffer.from(token.replaceAll(".", ""), "base64url").toString("latin1");

    expect(token).not.toContain("owner@example.com");
    expect(decoded).not.toContain("owner@example.com");
    expect(decoded).not.toContain("google-abc");
  });
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly, SameSite=Lax and path-wide", () => {
    const options = sessionCookieOptions(true, HOUR);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(HOUR);
  });

  it("carries Secure exactly when told to", () => {
    // Driven by NODE_ENV=production in readAuthConfig. It cannot be hardcoded on:
    // a Secure cookie is dropped by the browser over plain http://localhost.
    expect(sessionCookieOptions(true, HOUR).secure).toBe(true);
    expect(sessionCookieOptions(false, HOUR).secure).toBe(false);
  });
});

describe("OAuth handshake cookie", () => {
  const HANDSHAKE = { state: "state-1", verifier: "verifier-1", nonce: "nonce-1", next: "/records" };

  it("round-trips the PKCE verifier, state and nonce", () => {
    const opened = openHandshake(sealHandshake(HANDSHAKE, KEY), KEY);
    expect(opened).toMatchObject(HANDSHAKE);
  });

  it("expires after ten minutes", () => {
    const start = Date.parse("2026-01-01T00:00:00Z");
    const sealed = sealHandshake(HANDSHAKE, KEY, start);

    expect(openHandshake(sealed, KEY, start + 9 * 60 * 1000)).toMatchObject(HANDSHAKE);
    expect(openHandshake(sealed, KEY, start + 11 * 60 * 1000)).toBeNull();
  });

  it("returns null when absent, forged, or sealed with another key", () => {
    expect(openHandshake(undefined, KEY)).toBeNull();
    expect(openHandshake("garbage", KEY)).toBeNull();
    expect(openHandshake(sealHandshake(HANDSHAKE, OTHER_KEY), KEY)).toBeNull();
  });

  it("refuses a SESSION token presented as a handshake", () => {
    expect(openHandshake(createSessionToken(IDENTITY, KEY, HOUR), KEY)).toBeNull();
  });
});
