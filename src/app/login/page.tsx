import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card } from "@/components/card";
import { authConfig } from "@/lib/auth/config";
import { currentIdentity } from "@/lib/auth/guard";
import { safeNextPath } from "@/lib/auth/paths";
import { HevyKeyLoginForm } from "./key-form";

export const metadata: Metadata = {
  title: "Sign in — Hevy Planner",
};

// Reads cookies and env on every request; caching this page would serve one
// person's redirect decision to the next.
export const dynamic = "force-dynamic";

/** Callback failures arrive as a code, never as free text from the URL. */
const CALLBACK_ERRORS: Record<string, string> = {
  denied: "That account is not permitted to use this instance.",
  state: "That sign-in link expired or was already used. Try again.",
  exchange: "Google could not complete the sign-in. Try again.",
  config: "Authentication is not configured on this server.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const query = await searchParams;
  const result = authConfig();

  // The proxy answers 503 before this renders when the config is broken; this
  // is here so a direct render cannot produce a login form that leads nowhere.
  if (!result.ok) {
    return (
      <div className="ui-shell">
        <Card title="Not configured" description="This server cannot authenticate anyone yet.">
          <p className="ui-notice ui-notice--warn">
            Authentication is not configured. See the server log and the Authentication
            section of the README.
          </p>
        </Card>
      </div>
    );
  }

  const { config } = result;
  const next = safeNextPath(typeof query.next === "string" ? query.next : "/");

  // Already signed in — or running with AUTH_DISABLED, where there is nothing
  // to sign in to.
  if (await currentIdentity()) redirect(next);

  const errorCode = typeof query.error === "string" ? query.error : null;
  const errorMessage = errorCode ? (CALLBACK_ERRORS[errorCode] ?? CALLBACK_ERRORS.denied) : null;

  return (
    <div className="ui-shell">
      <header className="reveal flex flex-col gap-2.5">
        <h1 className="ui-h1">Sign in</h1>
        <p className="ui-sub">
          This planner holds a Hevy API key and can write routines to a real account, so
          it is closed to everyone but its owner.
        </p>
      </header>

      {errorMessage && <p className="ui-notice ui-notice--warn">{errorMessage}</p>}

      {config.mode === "google" ? (
        <Card
          title="Continue with Google"
          description="Only allowlisted Google accounts are admitted."
        >
          {/* A plain link, not a button with an onClick: the authorize URL is
              built on the server (it carries a fresh state, nonce and PKCE
              challenge that must be stored in a cookie at the same moment), and
              a link works with no client JavaScript at all. */}
          <a href={`/api/auth/start?next=${encodeURIComponent(next)}`} className="ui-btn ui-btn--primary">
            Continue with Google
          </a>
        </Card>
      ) : (
        <Card
          title="Sign in with your Hevy API key"
          description="The key is checked against Hevy and matched to an allowlisted account id."
        >
          <div className="flex flex-col gap-5">
            <p className="ui-notice">
              Hevy publishes no OAuth, so this is a shared-secret password gate rather than
              federated identity: anyone holding the key can sign in, and signing out cannot
              revoke it. Rotate the key in the Hevy app to lock this out.
            </p>
            <HevyKeyLoginForm next={next} />
          </div>
        </Card>
      )}
    </div>
  );
}
