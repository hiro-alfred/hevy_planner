import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { requireIdentity } from "@/lib/auth/guard";
import { profileCompleteness } from "@/lib/planner/profile-defaults";
import { muscleGroupLabel } from "@/lib/planner/profile";
import { getProfileStatus } from "@/lib/profile-store";
import { getTrainingStats } from "@/lib/profile-stats";
import { relativeDay } from "@/lib/records/format";
import { getHevyKeyStatus } from "@/lib/settings";
import { clearProfileAction } from "./actions";
import { CompletenessDial } from "./completeness-dial";
import { ProfileForm } from "./profile-form";
import { IdentityCard } from "./identity-card";

export const metadata: Metadata = {
  title: "Profile — Hevy Planner",
};

// Reads live DB state on every request; nothing here may be cached.
export const dynamic = "force-dynamic";

// The trainee, as opposed to the instance.
//
// The split from /settings is deliberate and nothing is duplicated: SETTINGS is
// the app's connection to the outside world — the Hevy key, the catalog cache,
// integration plumbing — while PROFILE is who the trainee is and what their
// plans should start from. Nothing on this page talks to Hevy. The one Hevy
// line below is a read-only status chip pointing at settings, never a second
// copy of the key form.

/** Whole tonnes. A five-digit kilogram total is a number nobody reads. */
function tonnes(kg: number | null): number {
  return kg === null ? 0 : Math.round(kg / 1000);
}

export default async function ProfilePage() {
  // Defence in depth: the proxy already redirects an unauthenticated GET, but
  // a check here means the gate survives a matcher change.
  const identity = await requireIdentity();
  // All four reads at once — the page is not useful without any of them, and
  // issuing them in sequence would just add round trips.
  const [{ profile, updatedAt }, stats, keyStatus] = await Promise.all([
    getProfileStatus(),
    getTrainingStats(),
    getHevyKeyStatus(),
  ]);

  const completeness = profileCompleteness(profile);
  const hasHistory = stats.workouts > 0;

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex flex-col gap-2.5">
          <h1 className="ui-h1">Profile</h1>
          <p className="ui-sub">
            The answers that do not change between plans. Saved once here, they fill in every
            new plan form — so building the next one is a single press.
          </p>
        </div>
        <Link href="/plans/new" className="ui-btn ui-btn--primary">
          New plan
        </Link>
      </header>

      <IdentityCard identity={identity} keyStatus={keyStatus} />

      <Card
        eyebrow="Standing profile"
        title="What your plans start from"
        description={
          profile === null
            ? "Nothing saved yet. Every blank below is something the planner would otherwise guess at or leave out."
            : `${savedWhen(updatedAt)}Each answer changes what the generator does — the misses say how.`
        }
        actions={
          profile !== null ? (
            <StatusChip tone={completeness.filled === completeness.total ? "ok" : "idle"}>
              {completeness.filled}/{completeness.total} answered
            </StatusChip>
          ) : undefined
        }
      >
        <CompletenessDial completeness={completeness} />
      </Card>

      <Card
        title="Your details"
        description="All optional. Skip everything and plans are built exactly as they were before this page existed."
      >
        <ProfileForm profile={profile} />
      </Card>

      {hasHistory ? (
        <>
          <div className="reveal ui-metrics">
            <StatTile value={stats.sessionsLast30} label="Sessions, last 30 days" />
            <StatTile value={stats.sessionsLast90} label="Sessions, last 90 days" />
            <StatTile value={tonnes(stats.tonnageKg)} label="Tonnes lifted, all time" />
          </div>

          <Card
            eyebrow="Training at a glance"
            title="How it has actually been going"
            description={
              stats.weeklyAverage === null
                ? "No sessions in the last 90 days."
                : `${stats.weeklyAverage} sessions per week over the last 90 days — worth comparing against the plan default above.`
            }
          >
            <div className="flex flex-col gap-4">
              <dl className="ui-profile__facts">
                <Fact label="First logged workout" value={dateOrDash(stats.firstWorkoutAt)} />
                <Fact label="Most recent" value={dateOrDash(stats.lastWorkoutAt)} />
                <Fact label="Workouts in the local cache" value={String(stats.workouts)} />
              </dl>

              {stats.topMuscles.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-ui-line-soft pt-4">
                  <span className="ui-eyebrow">Most-trained</span>
                  <ul className="flex flex-wrap gap-2">
                    {stats.topMuscles.map((muscle) => (
                      <li key={muscle.group ?? "unclassified"} className="ui-share">
                        {/* Null means the set's exercise is not in the local
                            catalog — a deleted custom exercise, most often. It
                            is shown rather than dropped, because dropping it
                            would make the percentages quietly not add up. */}
                        {muscle.group === null ? "Not in catalog" : muscleGroupLabel(muscle.group)}
                        <span className="ui-share__pct ui-mono">{muscle.percent}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-ui-faint">
                    Share of working sets. Warm-ups are never counted.{" "}
                    <Link href="/records" className="underline underline-offset-4">
                      Per-exercise records
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card
          title="No training history here yet"
          description="These numbers come from a local copy of your Hevy workouts, which has not been made yet. It is read-only — syncing it changes nothing in your Hevy account."
        >
          <Link href="/records" className="ui-btn ui-btn--secondary">
            Sync history
          </Link>
        </Card>
      )}

      {profile !== null && (
        <Card
          title="Clear your profile"
          description="Removes every saved answer. Plans you have already generated keep the values they were built with — those live in the plan, not here."
        >
          <ActionButton
            action={clearProfileAction}
            label="Clear profile"
            pendingLabel="Clearing…"
            tone="danger"
            confirm="Clear every saved profile answer?"
          />
        </Card>
      )}
    </div>
  );
}

/** One label/value line in the at-a-glance list. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-profile__fact">
      <dt className="text-sm text-ui-faint">{label}</dt>
      <dd className="ui-mono text-sm">{value}</dd>
    </div>
  );
}

/** Dates are rendered on the server only; no locale can disagree with itself. */
function dateOrDash(iso: string | null): string {
  return iso === null ? "—" : iso.slice(0, 10);
}

/**
 * "Last saved 3 d ago. " — or nothing at all.
 *
 * A profile can exist with no timestamp only if the row was written by hand,
 * but relativeDay("") returns "NaN mo ago" rather than throwing, and a readout
 * that says NaN is worse than one that says nothing.
 */
function savedWhen(updatedAt: string | null): string {
  return updatedAt === null ? "" : `Last saved ${relativeDay(updatedAt)}. `;
}
