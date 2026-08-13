// The authorization decision: given a verified identity claim, may it in?
//
// PURE on purpose — no env, no I/O, no cookies. Authentication (proving the
// claim is genuine) happens in google.ts and hevy-identity.ts; this module only
// answers the allowlist question, which makes the rule that actually protects
// the account testable in isolation rather than only through a live OAuth round
// trip nobody can run in CI.
//
// SCOPE: this app is single-user by design. There is one Hevy key in a global
// settings table and no user_id column anywhere, so an allowlist entry grants
// access to THE app's data — it does not own a slice of it. Listing two
// addresses means two people share one account, not that they get one each.

export type AuthProvider = "google" | "hevy-key";

export interface Identity {
  provider: AuthProvider;
  /** Stable id: Google's `sub`, or the Hevy user id. Never the email. */
  subject: string;
  /** Present for Google, null for the Hevy-key gate. Always lowercased. */
  email: string | null;
  /** Short display string for the header. Safe to render. */
  label: string;
}

export type DenialReason =
  | "empty-allowlist"
  | "email-missing"
  | "email-unverified"
  | "not-allowlisted";

export type AccessDecision =
  | { allowed: true; identity: Identity }
  | { allowed: false; reason: DenialReason };

/**
 * What the browser is told when access is refused, for every reason.
 *
 * One message for all denials on purpose: distinguishing "not on the allowlist"
 * from "unverified email" would let anyone probe which addresses are listed.
 * The specific reason goes to the server log instead.
 */
export const DENIED_MESSAGE =
  "That account is not permitted to use this instance.";

/** Claims taken from a VERIFIED Google id_token. */
export interface GoogleClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
}

/**
 * Google's rule.
 *
 * `email_verified` is not optional politeness: without it a Google Workspace
 * administrator on any domain could mint an account claiming the owner's
 * address, and the allowlist would wave it through. The allowlist is keyed on
 * email rather than `sub` only because a human can write an email into a config
 * file; the `sub` is what gets stored in the session afterwards.
 */
export function decideGoogleAccess(
  claims: GoogleClaims,
  allowedEmails: readonly string[],
): AccessDecision {
  if (allowedEmails.length === 0) return { allowed: false, reason: "empty-allowlist" };

  const email = claims.email?.trim().toLowerCase();
  if (!email) return { allowed: false, reason: "email-missing" };
  if (claims.email_verified !== true) return { allowed: false, reason: "email-unverified" };
  if (!allowedEmails.includes(email)) return { allowed: false, reason: "not-allowlisted" };

  return {
    allowed: true,
    identity: { provider: "google", subject: claims.sub, email, label: email },
  };
}

/**
 * The Hevy-key gate's rule.
 *
 * BE CLEAR ABOUT WHAT THIS IS: a shared-secret password gate wearing an API
 * key's clothes, not federated identity. Hevy publishes no OAuth — the pinned
 * spec (docs/hevy-openapi.json) has 14 paths, no token endpoint and no
 * securitySchemes block, only an `api-key` header on every operation. So the
 * strongest thing that can be built from it is: the visitor pastes a key, the
 * server spends it on GET /v1/user/info, and the id that comes back is checked
 * against this list. Anyone holding the key is the owner as far as this app can
 * tell, and the key is not rotated by signing out.
 *
 * Hevy ids are compared verbatim — they are opaque, and lowercasing an opaque
 * identifier is how you accidentally make two of them collide.
 */
export function decideHevyAccess(
  hevyUserId: string,
  allowedHevyUserIds: readonly string[],
): AccessDecision {
  if (allowedHevyUserIds.length === 0) return { allowed: false, reason: "empty-allowlist" };

  const subject = hevyUserId.trim();
  if (!subject || !allowedHevyUserIds.includes(subject)) {
    return { allowed: false, reason: "not-allowlisted" };
  }

  return {
    allowed: true,
    identity: {
      provider: "hevy-key",
      subject,
      email: null,
      label: `Hevy user ${subject.slice(0, 8)}`,
    },
  };
}
