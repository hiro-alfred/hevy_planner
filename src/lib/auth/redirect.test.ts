import { describe, expect, it } from "vitest";
import { LOGIN_PATH, relativeRedirect, safeNextPath } from "./paths";

// Regression: after a successful Google login the browser was sent to
// http://0.0.0.0:3000/ and died with ERR_ADDRESS_INVALID.
//
// Cause: the OAuth route handlers built absolute redirects with
// `new URL(path, request.nextUrl)`. In a ROUTE HANDLER that base is the
// server's BIND address rather than the Host header, and the Dockerfile binds
// HOSTNAME=0.0.0.0. The proxy was unaffected — its nextUrl does follow Host —
// so only the two OAuth legs broke, and only in the container. Local
// verification ran with HOSTNAME=127.0.0.1, a routable address, which is
// exactly why it was missed.
//
// These tests assert the PROPERTY that makes the bug impossible (the Location
// is relative, so the browser resolves it against its own request) rather than
// re-testing the old string, because any absolute origin baked here would be
// wrong for someone reaching the app by another name.

describe("relativeRedirect", () => {
  it("emits a RELATIVE Location, never an absolute URL", () => {
    const location = relativeRedirect("/settings").headers.get("location");

    expect(location).toBe("/settings");
    expect(location).not.toMatch(/^https?:\/\//);
  });

  it("never leaks a bind address into the redirect", () => {
    for (const path of ["/", "/settings", `${LOGIN_PATH}?error=state`]) {
      const location = relativeRedirect(path).headers.get("location")!;
      expect(location).not.toContain("0.0.0.0");
      expect(location).not.toContain("127.0.0.1");
      expect(location).not.toContain("localhost");
      expect(location.startsWith("/")).toBe(true);
    }
  });

  it("is a 307 by default and is never cached", () => {
    const response = relativeRedirect("/");
    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("can still carry cookies — the OAuth legs set and clear them on the redirect", () => {
    const response = relativeRedirect("/");
    response.cookies.set("hevy_planner_session", "token", { httpOnly: true, path: "/" });

    expect(response.headers.get("set-cookie")).toMatch(/hevy_planner_session=token/);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  });

  it("cannot be turned into an off-site redirect by the `next` parameter", () => {
    // safeNextPath runs before this, and a relative Location makes an absolute
    // destination unrepresentable anyway — belt and braces.
    const location = relativeRedirect(safeNextPath("https://evil.example/phish")).headers.get(
      "location",
    );
    expect(location).toBe("/");
  });
});
