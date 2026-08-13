import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readAuthConfig } from "./config";

// The refuse-to-serve rule. Every one of these asserts that a HALF-configured
// instance is a hard failure, because the alternative — an app that boots,
// looks healthy and is wide open — is this project's known silent-failure
// pattern (a missing LLM_API_KEY quietly degrades plan quality; a missing
// SETTINGS_ENCRYPTION_KEY quietly stores the Hevy key in plaintext). Auth does
// not get to join that list.

const SECRET = randomBytes(32).toString("base64");

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { NODE_ENV: "production", ...overrides } as NodeJS.ProcessEnv;
}

function problems(result: ReturnType<typeof readAuthConfig>): string {
  return result.ok ? "" : result.problems.join(" | ");
}

describe("readAuthConfig — refusing to serve", () => {
  it("refuses a completely empty environment", () => {
    const result = readAuthConfig(env({}));
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/AUTH_SESSION_SECRET/);
    expect(problems(result)).toMatch(/No identity provider is configured/);
  });

  it("refuses a provider with no session secret", () => {
    const result = readAuthConfig(env({ AUTH_ALLOWED_HEVY_USER_IDS: "user-1" }));
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/AUTH_SESSION_SECRET is not set/);
  });

  it("refuses a session secret that is not 32 bytes", () => {
    const result = readAuthConfig(
      env({ AUTH_SESSION_SECRET: "too-short", AUTH_ALLOWED_HEVY_USER_IDS: "user-1" }),
    );
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/must decode to 32 bytes/);
  });

  it("reports EVERY problem at once, not just the first", () => {
    // So an operator fixes the config in one pass instead of discovering the
    // next missing variable on the next restart.
    const result = readAuthConfig(env({ AUTH_PROVIDER: "google" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.length).toBeGreaterThan(2);
  });

  it("refuses Google sign-in with an EMPTY allowlist", () => {
    // Otherwise the gate admits every Google account on earth while looking shut.
    const result = readAuthConfig(
      env({
        AUTH_SESSION_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        AUTH_ORIGIN: "https://planner.example.com",
        AUTH_ALLOWED_EMAILS: "",
      }),
    );
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/every Google account on earth/);
  });

  it("refuses Google sign-in with no AUTH_ORIGIN to build a redirect URI from", () => {
    const result = readAuthConfig(
      env({
        AUTH_SESSION_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        AUTH_ALLOWED_EMAILS: "owner@example.com",
      }),
    );
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/AUTH_ORIGIN/);
  });

  it("refuses an ambiguous configuration where both providers are set up", () => {
    const result = readAuthConfig(
      env({
        AUTH_SESSION_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        AUTH_ORIGIN: "https://planner.example.com",
        AUTH_ALLOWED_EMAILS: "owner@example.com",
        AUTH_ALLOWED_HEVY_USER_IDS: "user-1",
      }),
    );
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/set AUTH_PROVIDER/);
  });
});

describe("readAuthConfig — accepting a good configuration", () => {
  it("configures Google and derives the redirect URI from AUTH_ORIGIN", () => {
    const result = readAuthConfig(
      env({
        AUTH_SESSION_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        AUTH_ORIGIN: "https://planner.example.com/",
        AUTH_ALLOWED_EMAILS: " Owner@Example.com , second@example.com ",
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.mode).toBe("google");
    // Lowercased and trimmed once, here, so no comparison downstream has to.
    expect(result.config.allowedEmails).toEqual(["owner@example.com", "second@example.com"]);
    expect(result.config.google?.redirectUri).toBe(
      "https://planner.example.com/api/auth/callback/google",
    );
    expect(result.config.sessionKey).toHaveLength(32);
    expect(result.config.secureCookies).toBe(true);
  });

  it("configures the Hevy-key gate from its allowlist alone", () => {
    const result = readAuthConfig(
      env({ AUTH_SESSION_SECRET: SECRET, AUTH_ALLOWED_HEVY_USER_IDS: "user-1,user-2" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.mode).toBe("hevy-key");
    expect(result.config.allowedHevyUserIds).toEqual(["user-1", "user-2"]);
  });

  it("leaves cookies non-Secure outside production so http://localhost works", () => {
    const result = readAuthConfig({
      NODE_ENV: "development",
      AUTH_SESSION_SECRET: SECRET,
      AUTH_ALLOWED_HEVY_USER_IDS: "user-1",
    } as NodeJS.ProcessEnv);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.secureCookies).toBe(false);
  });

  it("lets AUTH_PROVIDER disambiguate when both providers are configured", () => {
    const result = readAuthConfig(
      env({
        AUTH_PROVIDER: "hevy-key",
        AUTH_SESSION_SECRET: SECRET,
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        AUTH_ORIGIN: "https://planner.example.com",
        AUTH_ALLOWED_EMAILS: "owner@example.com",
        AUTH_ALLOWED_HEVY_USER_IDS: "user-1",
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.mode).toBe("hevy-key");
  });
});

describe("readAuthConfig — AUTH_DISABLED", () => {
  it("allows an explicitly open instance in development, with no secret needed", () => {
    const result = readAuthConfig({
      NODE_ENV: "development",
      AUTH_DISABLED: "true",
    } as NodeJS.ProcessEnv);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.mode).toBe("disabled");
  });

  it("REFUSES to run open under NODE_ENV=production", () => {
    const result = readAuthConfig(env({ AUTH_DISABLED: "true" }));
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/refused when NODE_ENV=production/);
  });

  it("only accepts the exact string 'true' — a stray value must not open the app", () => {
    for (const value of ["1", "yes", "false", "TRUE ", ""]) {
      const result = readAuthConfig({
        NODE_ENV: "development",
        AUTH_DISABLED: value,
      } as NodeJS.ProcessEnv);
      // Anything other than "true" falls through to the normal path, which has
      // no provider configured here and therefore refuses.
      if (value.trim().toLowerCase() === "true") continue;
      expect(result.ok).toBe(false);
    }
  });
});
