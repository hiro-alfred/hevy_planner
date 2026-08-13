import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/lib/auth/config";
import { isPublicPath, LOGIN_PATH } from "@/lib/auth/paths";
import { readSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

// The gate in front of every request.
//
// This is `proxy.ts`, not `middleware.ts`: Next.js 16 renamed the convention
// (the functionality is unchanged, and `middleware.ts` is deprecated). Proxy
// also defaults to the Node.js runtime in 16, which is what lets this file use
// node:crypto by way of secret-box to open the session cookie — on the old edge
// runtime it could not have.
//
// It is the COARSE gate only. It keeps unauthenticated traffic off every page
// and every route handler, and it is the layer that returns a clean 401 instead
// of letting a request reach code that assumes a user. It is explicitly NOT the
// last line of defence for mutations — see lib/auth/guard.ts for why server
// actions each check again.

/** Operator-facing, so it names the variables. Contains no secret values. */
function refuseToServe(problems: string[]): NextResponse {
  return new NextResponse(
    [
      "Hevy Planner is not configured for authentication and is refusing to serve.",
      "",
      ...problems.map((problem) => `  - ${problem}`),
      "",
      "This app stores a Hevy Pro API key and can create routines that the Hevy API",
      "has no endpoint to delete. Running it open is not a supported mode.",
      "Set the variables above (see .env.example), or AUTH_DISABLED=true for local",
      "development only — that is refused when NODE_ENV=production.",
      "",
    ].join("\n"),
    {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // A misconfigured instance must never be cached as if it were the app.
        "cache-control": "no-store",
      },
    },
  );
}

export function proxy(request: NextRequest): NextResponse {
  const result = authConfig();
  if (!result.ok) return refuseToServe(result.problems);

  const { config } = result;
  if (config.mode === "disabled") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (readSessionToken(token, config.sessionKey!)) return NextResponse.next();

  // A safe, idempotent request is a navigation: send the person to the login
  // form and remember where they were going.
  if (request.method === "GET" || request.method === "HEAD") {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    const response = NextResponse.redirect(url);
    response.headers.set("cache-control", "no-store");
    return response;
  }

  // Everything else — server actions, route handlers, form POSTs — gets 401 and
  // is NOT redirected. A 3xx on a mutation is ambiguous: some clients replay it
  // as a GET, and the caller cannot tell "you are logged out" from "this
  // succeeded and moved". A status code says it once, unambiguously.
  return new NextResponse("Unauthorized", {
    status: 401,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = {
  matcher: [
    /*
     * Everything except what is served before the app and carries no data:
     *   _next/static   build assets
     *   _next/image    the image optimiser
     *   favicon.ico    requested by the browser on its own
     *
     * Note there is NO `api` exclusion here, unlike the pattern most examples
     * copy. This app's only route handler is the OAuth callback, which is
     * allowlisted by path in lib/auth/paths.ts; excluding /api wholesale in the
     * matcher would silently exempt every route handler added later.
     *
     * `_next/data` requests run the proxy regardless of this list — Next does
     * that deliberately so protecting a page cannot leave its data route open.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
