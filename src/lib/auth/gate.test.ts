import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicPath, LOGIN_PATH, PUBLIC_PATHS, safeNextPath } from "./paths";

// The GATE: which requests the proxy lets through, and what a logged-out
// mutation gets back.
//
// The proxy is imported dynamically inside each block because it reads the auth
// configuration from the environment on first use and memoises it — so the env
// has to be set before the module graph is evaluated, and the cache reset
// between cases. Same discipline as src/test/database.ts.

const SECRET = randomBytes(32).toString("base64");

async function loadProxy(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) process.env[key] = value;

  const { resetAuthConfigCache } = await import("./config");
  resetAuthConfigCache();
  const { proxy } = await import("@/proxy");
  return proxy;
}

/** A NextRequest stand-in — the proxy uses nextUrl, cookies and method only. */
function request(
  path: string,
  { method = "GET", cookie }: { method?: string; cookie?: string } = {},
) {
  const url = new URL(`http://localhost:3000${path}`);
  return {
    method,
    nextUrl: Object.assign(url, { clone: () => new URL(url.toString()) }),
    cookies: { get: (name: string) => (cookie && name === "hevy_planner_session" ? { value: cookie } : undefined) },
  } as never;
}

const GATED_ENV = {
  NODE_ENV: "development",
  AUTH_SESSION_SECRET: SECRET,
  AUTH_ALLOWED_HEVY_USER_IDS: "user-1",
  AUTH_PROVIDER: "hevy-key",
};

const CLEAR = ["AUTH_SESSION_SECRET", "AUTH_ALLOWED_HEVY_USER_IDS", "AUTH_PROVIDER", "AUTH_DISABLED", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_ORIGIN", "AUTH_ALLOWED_EMAILS"];

beforeEach(() => {
  for (const key of CLEAR) delete process.env[key];
});

describe("the proxy gate, logged out", () => {
  it("answers a SERVER ACTION POST with 401 and does NOT redirect it", async () => {
    // The headline requirement. A server action is a POST to the page's own
    // path, so this is exactly the request the browser makes when a button is
    // clicked with no session. 401 rather than a 3xx: a redirect on a mutation
    // is ambiguous, and some clients replay it as a GET.
    const proxy = await loadProxy(GATED_ENV);
    const response = proxy(request("/settings", { method: "POST" }));

    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers every other mutating method with 401 too", async () => {
    const proxy = await loadProxy(GATED_ENV);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(proxy(request("/plans/1", { method })).status).toBe(401);
    }
  });

  it("redirects a page navigation to the login form, remembering the destination", async () => {
    const proxy = await loadProxy(GATED_ENV);
    const response = proxy(request("/records?sort=weight"));

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe(LOGIN_PATH);
    expect(location.searchParams.get("next")).toBe("/records?sort=weight");
  });

  it("gates the settings page, where the Hevy key lives", async () => {
    const proxy = await loadProxy(GATED_ENV);
    expect(proxy(request("/settings")).status).toBe(307);
  });

  it("lets the login page and the OAuth callback through", async () => {
    const proxy = await loadProxy(GATED_ENV);
    for (const path of PUBLIC_PATHS) {
      // NextResponse.next() reports 200 and carries no Location.
      expect(proxy(request(path)).headers.get("location")).toBeNull();
    }
  });

  it("does not treat a path that merely STARTS WITH a public one as public", async () => {
    const proxy = await loadProxy(GATED_ENV);
    expect(proxy(request("/login-as-owner")).status).toBe(307);
    expect(proxy(request("/api/auth/callback/google/../../../settings")).status).toBe(307);
  });

  it("gates an unknown /api path rather than exempting /api wholesale", async () => {
    // The usual copied matcher excludes `api`, which silently exempts every
    // route handler added later.
    const proxy = await loadProxy(GATED_ENV);
    expect(proxy(request("/api/anything", { method: "POST" })).status).toBe(401);
  });
});

describe("the proxy gate, logged in", () => {
  async function tokenFor(subject = "user-1") {
    const { createSessionToken } = await import("./session");
    const { parseKeyMaterial } = await import("@/lib/secret-box");
    return createSessionToken(
      { provider: "hevy-key", subject, email: null, label: subject },
      parseKeyMaterial(SECRET, "AUTH_SESSION_SECRET"),
      3600,
    );
  }

  it("lets a valid session through to a page and to an action POST", async () => {
    const proxy = await loadProxy(GATED_ENV);
    const cookie = await tokenFor();

    expect(proxy(request("/settings", { cookie })).headers.get("location")).toBeNull();
    expect(proxy(request("/settings", { method: "POST", cookie })).status).toBe(200);
  });

  it("still refuses a session cookie signed with a different secret", async () => {
    const proxy = await loadProxy(GATED_ENV);
    const { createSessionToken } = await import("./session");
    const forged = createSessionToken(
      { provider: "hevy-key", subject: "user-1", email: null, label: "user-1" },
      randomBytes(32),
      3600,
    );

    expect(proxy(request("/settings", { method: "POST", cookie: forged })).status).toBe(401);
  });

  it("refuses an expired session", async () => {
    const proxy = await loadProxy(GATED_ENV);
    const { createSessionToken } = await import("./session");
    const { parseKeyMaterial } = await import("@/lib/secret-box");
    const stale = createSessionToken(
      { provider: "hevy-key", subject: "user-1", email: null, label: "user-1" },
      parseKeyMaterial(SECRET, "AUTH_SESSION_SECRET"),
      3600,
      Date.now() - 7200 * 1000,
    );

    expect(proxy(request("/settings", { method: "POST", cookie: stale })).status).toBe(401);
  });
});

describe("the proxy gate, misconfigured", () => {
  it("REFUSES TO SERVE with 503 rather than running open", async () => {
    const proxy = await loadProxy({ NODE_ENV: "development" });
    const response = proxy(request("/"));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses the login page too — there is nothing to log in to", async () => {
    const proxy = await loadProxy({ NODE_ENV: "development" });
    expect(proxy(request(LOGIN_PATH)).status).toBe(503);
  });

  it("refuses AUTH_DISABLED in production", async () => {
    const proxy = await loadProxy({ NODE_ENV: "production", AUTH_DISABLED: "true" });
    expect(proxy(request("/")).status).toBe(503);
  });

  it("serves everything openly under AUTH_DISABLED in development", async () => {
    const proxy = await loadProxy({ NODE_ENV: "development", AUTH_DISABLED: "true" });
    expect(proxy(request("/settings", { method: "POST" })).status).toBe(200);
  });
});

describe("public path list", () => {
  it("keeps the public surface to the login route and the OAuth legs", () => {
    expect(PUBLIC_PATHS).toEqual(["/login", "/api/auth/callback/google", "/api/auth/start"]);
  });

  it("matches exactly, never by prefix", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/login/")).toBe(false);
    expect(isPublicPath("/login/../settings")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a local path", () => {
    expect(safeNextPath("/records?sort=weight")).toBe("/records?sort=weight");
  });

  it("refuses an OPEN REDIRECT off-site", () => {
    // A login page that bounces anywhere is the standard phishing primitive.
    for (const hostile of [
      "https://evil.example/phish",
      "//evil.example",
      "/\\evil.example",
      "http://evil.example",
    ]) {
      expect(safeNextPath(hostile)).toBe("/");
    }
  });

  it("refuses to bounce back to the login page, which would loop", () => {
    expect(safeNextPath(LOGIN_PATH)).toBe("/");
  });

  it("falls back to the root for absent input", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});
