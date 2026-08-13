import "server-only";
import { parseKeyMaterial, SecretBoxError } from "@/lib/secret-box";

// Reads the auth configuration out of the environment, as a PURE function of an
// env bag so the decision is unit-testable without a running server.
//
// THE CENTRAL RULE: this app refuses to serve when auth is not configured.
//
// That is a deliberate reversal of how the rest of the project degrades. A
// missing LLM_API_KEY silently falls back to rule-based plans, and a missing
// SETTINGS_ENCRYPTION_KEY silently stores the Hevy key in plaintext — both are
// known silent-failure traps this repo has flagged repeatedly. Auth cannot join
// that list: an instance that "looks healthy while unprotected" hands anyone who
// reaches the port a Hevy Pro key and the ability to write routines that the
// Hevy API has NO endpoint to delete. So a misconfiguration is a hard 503 with
// the missing variables named, never an open door.
//
// The one escape hatch is AUTH_DISABLED=true. It is explicit, it is refused in
// production, and it announces itself on every boot — the opposite of silent.

export type AuthMode = "google" | "hevy-key" | "disabled";

export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  /** Absolute, and must match a redirect URI registered on the OAuth client. */
  redirectUri: string;
}

export interface AuthConfig {
  mode: AuthMode;
  /** 32 raw bytes. Absent only when mode is "disabled". */
  sessionKey: Buffer | null;
  /** Lowercased Google account emails permitted to sign in. */
  allowedEmails: string[];
  /** Hevy user ids (from GET /v1/user/info `data.id`) permitted to sign in. */
  allowedHevyUserIds: string[];
  google: GoogleOptions | null;
  sessionTtlSeconds: number;
  /** Sets the `Secure` cookie attribute. */
  secureCookies: boolean;
}

export type AuthConfigResult =
  | { ok: true; config: AuthConfig }
  | { ok: false; problems: string[] };

const DEFAULT_TTL_HOURS = 720; // 30 days — a personal tool, re-auth is friction.
const MAX_TTL_HOURS = 8760;

/** Splits a comma-separated allowlist, dropping blanks. */
function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseTtlSeconds(raw: string | undefined, problems: string[]): number {
  if (!raw?.trim()) return DEFAULT_TTL_HOURS * 3600;
  const hours = Number(raw.trim());
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_TTL_HOURS) {
    problems.push(
      `AUTH_SESSION_TTL_HOURS must be a positive number of hours up to ${MAX_TTL_HOURS} (got "${raw}").`,
    );
    return DEFAULT_TTL_HOURS * 3600;
  }
  return Math.floor(hours * 3600);
}

function isTrue(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/**
 * Picks the provider.
 *
 * Inferred from which credentials are present rather than requiring the owner
 * to set a mode AND the values for it — two sources of truth for one decision is
 * how you end up with a Google client configured and a password gate serving.
 * AUTH_PROVIDER exists only to disambiguate when BOTH are configured.
 */
function resolveMode(env: NodeJS.ProcessEnv, problems: string[]): AuthMode | null {
  const declared = env.AUTH_PROVIDER?.trim().toLowerCase();
  if (declared && declared !== "google" && declared !== "hevy-key") {
    problems.push(`AUTH_PROVIDER must be "google" or "hevy-key" (got "${declared}").`);
    return null;
  }

  const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
  const hasHevyGate = parseList(env.AUTH_ALLOWED_HEVY_USER_IDS).length > 0;

  if (declared === "google") return "google";
  if (declared === "hevy-key") return "hevy-key";
  if (hasGoogle && hasHevyGate) {
    problems.push(
      "Both a Google client and AUTH_ALLOWED_HEVY_USER_IDS are configured — set " +
        'AUTH_PROVIDER to "google" or "hevy-key" to say which one should serve.',
    );
    return null;
  }
  if (hasGoogle) return "google";
  if (hasHevyGate) return "hevy-key";

  problems.push(
    "No identity provider is configured. Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET " +
      "(recommended), or AUTH_ALLOWED_HEVY_USER_IDS for the Hevy-key gate. " +
      "See the Authentication section of the README.",
  );
  return null;
}

function readSessionKey(env: NodeJS.ProcessEnv, problems: string[]): Buffer | null {
  const raw = env.AUTH_SESSION_SECRET?.trim();
  if (!raw) {
    problems.push(
      "AUTH_SESSION_SECRET is not set. Generate one with: " +
        `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`,
    );
    return null;
  }
  try {
    return parseKeyMaterial(raw, "AUTH_SESSION_SECRET");
  } catch (error) {
    problems.push(
      error instanceof SecretBoxError ? error.message : "AUTH_SESSION_SECRET is unreadable.",
    );
    return null;
  }
}

/**
 * Builds the config, or the list of reasons the app must refuse to serve.
 *
 * Collects EVERY problem rather than returning at the first one, so an operator
 * fixes the configuration in one pass instead of discovering the next missing
 * variable on the next restart.
 */
export function readAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfigResult {
  const problems: string[] = [];
  const isProduction = env.NODE_ENV === "production";
  const secureCookies = isProduction;

  if (isTrue(env.AUTH_DISABLED)) {
    if (isProduction) {
      return {
        ok: false,
        problems: [
          "AUTH_DISABLED=true is refused when NODE_ENV=production. This app holds a " +
            "Hevy Pro API key and can write routines that Hevy cannot delete; it must " +
            "not run open in a deployment. Unset AUTH_DISABLED and configure a provider.",
        ],
      };
    }
    return {
      ok: true,
      config: {
        mode: "disabled",
        sessionKey: null,
        allowedEmails: [],
        allowedHevyUserIds: [],
        google: null,
        sessionTtlSeconds: DEFAULT_TTL_HOURS * 3600,
        secureCookies,
      },
    };
  }

  const sessionKey = readSessionKey(env, problems);
  const sessionTtlSeconds = parseTtlSeconds(env.AUTH_SESSION_TTL_HOURS, problems);
  const mode = resolveMode(env, problems);

  // Emails are the allowlist key for Google, and Google returns them in the
  // case the user typed. Lowercase once here so every later comparison is a
  // plain equality against a normalised value.
  const allowedEmails = parseList(env.AUTH_ALLOWED_EMAILS).map((email) => email.toLowerCase());
  const allowedHevyUserIds = parseList(env.AUTH_ALLOWED_HEVY_USER_IDS);

  let google: GoogleOptions | null = null;

  if (mode === "google") {
    const clientId = env.GOOGLE_CLIENT_ID?.trim();
    const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
    const origin = env.AUTH_ORIGIN?.trim().replace(/\/+$/, "");

    if (!clientId) problems.push("GOOGLE_CLIENT_ID is not set.");
    if (!clientSecret) problems.push("GOOGLE_CLIENT_SECRET is not set.");
    if (!origin) {
      problems.push(
        "AUTH_ORIGIN is not set. It must be the app's public origin (e.g. " +
          "http://localhost:3000), because the redirect URI is built from it and has " +
          "to match the one registered on the Google OAuth client exactly.",
      );
    } else if (!/^https?:\/\/[^/]+$/.test(origin)) {
      problems.push(`AUTH_ORIGIN must be a bare origin like https://planner.example.com (got "${origin}").`);
    }
    // An empty allowlist would authenticate anyone with a Google account — the
    // gate would be open to the entire internet, which is worse than no gate at
    // all because it looks closed.
    if (allowedEmails.length === 0) {
      problems.push(
        "AUTH_ALLOWED_EMAILS is empty. With Google sign-in and no allowlist, every " +
          "Google account on earth would be admitted. List the owner's address.",
      );
    }
    if (clientId && clientSecret && origin) {
      google = { clientId, clientSecret, redirectUri: `${origin}${GOOGLE_CALLBACK_PATH}` };
    }
  }

  if (mode === "hevy-key" && allowedHevyUserIds.length === 0) {
    problems.push("AUTH_ALLOWED_HEVY_USER_IDS is empty, so no identity could ever sign in.");
  }

  if (problems.length > 0 || !mode || !sessionKey) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    config: {
      mode,
      sessionKey,
      allowedEmails,
      allowedHevyUserIds,
      google,
      sessionTtlSeconds,
      secureCookies,
    },
  };
}

/** Where Google sends the browser back. Public by necessity — see proxy.ts. */
export const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

// Config is read once per process: the environment cannot change under a
// running server, and re-parsing on every request would re-run the key decode
// on the hot path of every page view and every server action.
let cached: AuthConfigResult | null = null;

export function authConfig(): AuthConfigResult {
  cached ??= readAuthConfig();
  return cached;
}

/** Test-only: drops the memoised config so a test can vary the environment. */
export function resetAuthConfigCache(): void {
  cached = null;
}
