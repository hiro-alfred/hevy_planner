import { logoutAction } from "@/app/login/actions";
import { StatusChip } from "@/components/status-chip";
import { currentIdentity } from "@/lib/auth/guard";

/**
 * Who is signed in, plus the way out.
 *
 * A separate async server component rather than an `await` in the root layout,
 * because a top-level await there would hold every page's first streamed chunk
 * behind a cookie decrypt. Wrapped in <Suspense> by the layout so the rest of
 * the shell renders first.
 *
 * The label is the allowlisted email (Google) or a truncated Hevy user id —
 * never a token, and never the API key. Under AUTH_DISABLED it reads
 * "AUTH DISABLED", which is the point: an open instance should say so on every
 * page rather than looking identical to a protected one.
 */
export async function SessionBadge() {
  let identity;
  try {
    identity = await currentIdentity();
  } catch {
    // currentIdentity() throws when auth is unconfigured, which is right for a
    // page that serves data and wrong here. This component sits in the ROOT
    // LAYOUT, so it also renders while `next build` prerenders /_not-found —
    // and a build must not require the deployment's secrets to be present.
    // Swallowing it costs nothing: the badge is decoration, and a misconfigured
    // instance never gets this far at runtime because the proxy answers 503.
    return null;
  }
  if (!identity) return null;

  const isOpenInstance = identity.subject === "auth-disabled";

  return (
    <span className="flex items-center gap-3">
      <StatusChip tone={isOpenInstance ? "warn" : "ok"}>{identity.label}</StatusChip>
      {!isOpenInstance && (
        <form action={logoutAction}>
          <button type="submit" className="ui-navlink">
            Sign out
          </button>
        </form>
      )}
    </span>
  );
}
