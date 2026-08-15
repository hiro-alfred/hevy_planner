import Link from "next/link";
import { Card } from "@/components/card";
import { StatusChip } from "@/components/status-chip";
import type { Identity } from "@/lib/auth/authorize";
import type { HevyKeyStatus } from "@/lib/settings";

// Who is signed in, and how — plus the one thing about the gate that the app
// has never said out loud anywhere a user can read it.

const PROVIDER_LABEL: Record<Identity["provider"], string> = {
  google: "Google",
  "hevy-key": "Hevy API key",
};

/**
 * The monogram, from the identity's own label.
 *
 * A REAL avatar is not available and is not worth buying: lib/auth/google.ts
 * requests the `openid email` scope only, with a comment saying `profile`
 * "would pull a name and picture this app has no use for". Fetching one would
 * mean a wider consent scope, a stored picture URL and an external image host —
 * decoration at the cost of asking for more of someone's account.
 */
function monogram(label: string): string {
  const first = label.trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

export function IdentityCard({
  identity,
  keyStatus,
}: {
  identity: Identity;
  keyStatus: HevyKeyStatus;
}) {
  const isOpenInstance = identity.subject === "auth-disabled";

  return (
    <Card
      title="Signed in"
      description="Sign out from the badge in the top right."
      actions={
        isOpenInstance ? <StatusChip tone="warn">Auth disabled</StatusChip> : undefined
      }
    >
      <div className="ui-profile__id">
        <span className="ui-monogram" aria-hidden="true">
          {monogram(identity.label)}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="ui-profile__name">{identity.label}</span>
          <span className="ui-profile__meta">
            Signed in with {PROVIDER_LABEL[identity.provider]}
          </span>
        </div>
        <div className="ui-profile__conn">
          {keyStatus.configured ? (
            <StatusChip tone="ok">Hevy connected · ····{keyStatus.last4}</StatusChip>
          ) : (
            <StatusChip tone="idle">Hevy not connected</StatusChip>
          )}
          <Link href="/settings" className="ui-profile__link">
            Manage in settings
          </Link>
        </div>
      </div>

      {/* Stated here because it is stated nowhere a user can see. Signing out
          of a hevy-key session does not revoke anything: the key IS the
          credential, and this app cannot rotate someone's Hevy key. */}
      {identity.provider === "hevy-key" && !isOpenInstance && (
        <p className="ui-notice ui-notice--info mt-4">
          Signing out clears this session but does not revoke the API key you signed in with —
          the key is the credential. Rotate it in the Hevy app to truly revoke access.
        </p>
      )}
    </Card>
  );
}
