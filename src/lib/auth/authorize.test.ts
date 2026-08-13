import { describe, expect, it } from "vitest";
import { decideGoogleAccess, decideHevyAccess, DENIED_MESSAGE } from "./authorize";

// The authorization decision — the rule that actually keeps other people out of
// the owner's Hevy account. Pure, so every branch is reachable without a
// browser, a Google client or a network.

describe("decideGoogleAccess", () => {
  const ALLOWED = ["owner@example.com"];

  it("admits an allowlisted, verified address", () => {
    const decision = decideGoogleAccess(
      { sub: "google-123", email: "owner@example.com", email_verified: true },
      ALLOWED,
    );

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.identity).toEqual({
      provider: "google",
      subject: "google-123",
      email: "owner@example.com",
      label: "owner@example.com",
    });
  });

  it("refuses an address that is not on the list", () => {
    const decision = decideGoogleAccess(
      { sub: "google-999", email: "someone@else.com", email_verified: true },
      ALLOWED,
    );

    expect(decision).toEqual({ allowed: false, reason: "not-allowlisted" });
  });

  it("refuses an allowlisted address whose email is UNVERIFIED", () => {
    // The important one. Without the email_verified check, anyone who can run a
    // Google Workspace domain could mint an account asserting the owner's
    // address and the allowlist would wave it straight through.
    const decision = decideGoogleAccess(
      { sub: "attacker", email: "owner@example.com", email_verified: false },
      ALLOWED,
    );

    expect(decision).toEqual({ allowed: false, reason: "email-unverified" });
  });

  it("treats a missing email_verified claim as unverified, not as verified", () => {
    const decision = decideGoogleAccess({ sub: "x", email: "owner@example.com" }, ALLOWED);
    expect(decision).toEqual({ allowed: false, reason: "email-unverified" });
  });

  it("refuses a token carrying no email at all", () => {
    expect(decideGoogleAccess({ sub: "x", email_verified: true }, ALLOWED)).toEqual({
      allowed: false,
      reason: "email-missing",
    });
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const decision = decideGoogleAccess(
      { sub: "x", email: "  Owner@Example.COM ", email_verified: true },
      ALLOWED,
    );

    expect(decision.allowed).toBe(true);
    // Normalised on the way in, so nothing downstream has to remember to.
    if (decision.allowed) expect(decision.identity.email).toBe("owner@example.com");
  });

  it("FAILS CLOSED on an empty allowlist rather than admitting every Google account", () => {
    const decision = decideGoogleAccess(
      { sub: "anyone", email: "anyone@gmail.com", email_verified: true },
      [],
    );

    expect(decision).toEqual({ allowed: false, reason: "empty-allowlist" });
  });

  it("does not let a substring of an allowlisted address in", () => {
    const decision = decideGoogleAccess(
      { sub: "x", email: "owner@example.com.evil.test", email_verified: true },
      ALLOWED,
    );

    expect(decision.allowed).toBe(false);
  });
});

describe("decideHevyAccess", () => {
  const ALLOWED = ["hevy-user-abcdef123456"];

  it("admits an allowlisted Hevy user id", () => {
    const decision = decideHevyAccess("hevy-user-abcdef123456", ALLOWED);

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.identity.provider).toBe("hevy-key");
      expect(decision.identity.subject).toBe("hevy-user-abcdef123456");
      // No email exists for this provider; the label must still be renderable.
      expect(decision.identity.email).toBeNull();
      expect(decision.identity.label).toBe("Hevy user hevy-use");
    }
  });

  it("refuses a valid key belonging to a different Hevy account", () => {
    expect(decideHevyAccess("some-other-account", ALLOWED)).toEqual({
      allowed: false,
      reason: "not-allowlisted",
    });
  });

  it("compares ids verbatim — case is significant for an opaque identifier", () => {
    expect(decideHevyAccess("HEVY-USER-ABCDEF123456", ALLOWED).allowed).toBe(false);
  });

  it("fails closed on an empty allowlist", () => {
    expect(decideHevyAccess("anything", [])).toEqual({
      allowed: false,
      reason: "empty-allowlist",
    });
  });

  it("refuses a blank id", () => {
    expect(decideHevyAccess("   ", ALLOWED).allowed).toBe(false);
  });
});

describe("DENIED_MESSAGE", () => {
  it("names no address, id or allowlist, so a refusal cannot be used to enumerate", () => {
    expect(DENIED_MESSAGE).not.toMatch(/@|allowlist|AUTH_ALLOWED/i);
  });
});
