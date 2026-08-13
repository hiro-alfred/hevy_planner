import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The action-level gate. The proxy is covered in gate.test.ts; this covers the
// check that runs INSIDE every server action, which is the layer that still
// holds when a request reaches an action without passing a protected route.

const SECRET = randomBytes(32).toString("base64");

/** Stands in for the cookie jar next/headers would return. */
let cookieValue: string | undefined;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "hevy_planner_session" && cookieValue ? { value: cookieValue } : undefined,
  }),
}));

// redirect() signals by throwing, which is exactly why requireIdentity() has to
// be called before any try/catch in an action. The mock reproduces that.
class RedirectSignal extends Error {
  constructor(public readonly to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectSignal(to);
  },
}));

// React's cache() memoises per render pass; outside one it only needs to call
// through, and stubbing it keeps a memoised null from leaking between tests.
vi.mock("react", () => ({ cache: <T,>(fn: T) => fn }));

async function loadGuard(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ["AUTH_SESSION_SECRET", "AUTH_ALLOWED_HEVY_USER_IDS", "AUTH_PROVIDER", "AUTH_DISABLED"]) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) process.env[key] = value;

  const { resetAuthConfigCache } = await import("./config");
  resetAuthConfigCache();
  return import("./guard");
}

const GATED = {
  NODE_ENV: "development",
  AUTH_SESSION_SECRET: SECRET,
  AUTH_ALLOWED_HEVY_USER_IDS: "user-1",
  AUTH_PROVIDER: "hevy-key",
};

beforeEach(() => {
  cookieValue = undefined;
});

describe("requireIdentity", () => {
  it("redirects to the login page when there is no session cookie", async () => {
    const { requireIdentity } = await loadGuard(GATED);
    await expect(requireIdentity()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
  });

  it("redirects when the cookie is a forgery", async () => {
    const { requireIdentity } = await loadGuard(GATED);
    cookieValue = "not-a-real-token";
    await expect(requireIdentity()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("redirects when the session has expired", async () => {
    const { requireIdentity } = await loadGuard(GATED);
    const { createSessionToken } = await import("./session");
    const { parseKeyMaterial } = await import("@/lib/secret-box");

    cookieValue = createSessionToken(
      { provider: "hevy-key", subject: "user-1", email: null, label: "user-1" },
      parseKeyMaterial(SECRET, "AUTH_SESSION_SECRET"),
      3600,
      Date.now() - 7200 * 1000,
    );

    await expect(requireIdentity()).rejects.toThrow(/NEXT_REDIRECT/);
  });

  it("returns the identity for a valid session", async () => {
    const { requireIdentity } = await loadGuard(GATED);
    const { createSessionToken } = await import("./session");
    const { parseKeyMaterial } = await import("@/lib/secret-box");

    cookieValue = createSessionToken(
      { provider: "hevy-key", subject: "user-1", email: null, label: "user-1" },
      parseKeyMaterial(SECRET, "AUTH_SESSION_SECRET"),
      3600,
    );

    await expect(requireIdentity()).resolves.toMatchObject({
      provider: "hevy-key",
      subject: "user-1",
    });
  });

  it("THROWS rather than redirecting when auth is unconfigured", async () => {
    // A misconfiguration must not present as "logged out", which would send the
    // owner to a login page that can never succeed.
    const { requireIdentity } = await loadGuard({ NODE_ENV: "development" });
    await expect(requireIdentity()).rejects.toThrow(/Auth is not configured/);
  });

  it("admits everyone under AUTH_DISABLED, with an unmistakable label", async () => {
    const { requireIdentity } = await loadGuard({
      NODE_ENV: "development",
      AUTH_DISABLED: "true",
    });

    await expect(requireIdentity()).resolves.toMatchObject({
      subject: "auth-disabled",
      label: "AUTH DISABLED",
    });
  });
});
