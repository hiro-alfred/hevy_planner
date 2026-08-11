import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/card";
import { StatTile } from "@/components/stat-tile";
import { StatusChip } from "@/components/status-chip";
import { HevyApiError } from "@/lib/hevy/client";
import { describeHevyError } from "@/lib/hevy/errors";
import { estimateMinutes } from "@/lib/hevy/routine-format";
import { getRoutineDetail, type RoutineDetail } from "@/lib/hevy/routine-detail";
import { getHevyClient, NO_KEY_MESSAGE } from "@/lib/hevy/session";
import { relativeDay } from "@/lib/records/format";
import { RoutineExercise } from "./routine-exercise";

export const metadata: Metadata = {
  title: "Routine — Hevy Planner",
};

export const dynamic = "force-dynamic";

// One routine in the Hevy account, opened.
//
// Read LIVE from Hevy rather than from this app's copy of the plan, and that
// distinction is the reason the page is worth having: a routine can be edited
// in the Hevy app, or can have been created there in the first place, and only
// Hevy knows what it currently says. The plan link below is the app's claim
// about the routine; the exercises are the routine itself.
//
// Read-only, like the rest of /routines. Every request it issues is a GET.

function Missing({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <h1 className="ui-h1">{title}</h1>
      </header>
      {children}
    </div>
  );
}

function Detail({ routine }: { routine: RoutineDetail }) {
  const minutes = estimateMinutes(
    routine.exercises.map((exercise) => ({
      sets: exercise.sets,
      restSeconds: exercise.restSeconds,
    })),
  );
  const workingSets = routine.exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.type !== "warmup").length,
    0,
  );

  return (
    <div className="ui-shell">
      <header className="reveal ui-hero">
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="ui-eyebrow">
            <Link href="/routines" className="underline">
              In Hevy
            </Link>
            {routine.folderTitle && ` · ${routine.folderTitle}`}
          </span>
          <h1 className="ui-h1">{routine.title}</h1>
          <p className="ui-sub">
            {routine.exercises.length} exercise{routine.exercises.length === 1 ? "" : "s"} ·{" "}
            {workingSets} working sets · about {minutes} min
          </p>
        </div>
        <StatusChip tone={routine.planId === null ? "idle" : "ok"}>
          {routine.planId === null ? "Not from a plan" : `Day ${routine.day}`}
        </StatusChip>
      </header>

      <div className="reveal reveal--d1 ui-metrics">
        <StatTile value={routine.sessionCount} label="Times trained" />
        <StatTile value={workingSets} label="Working sets" />
        <StatTile value={minutes} label="Minutes, estimated" />
      </div>

      {routine.planId !== null && (
        <div className="ui-notice ui-notice--info">
          Day {routine.day} of{" "}
          <Link href={`/plans/${routine.planId}`} className="underline">
            {routine.planTitle ?? `plan ${routine.planId}`}
          </Link>
          . What you see here is what is in Hevy right now — if it was edited in the Hevy app it
          will differ from the plan, and re-syncing the plan overwrites it.
        </div>
      )}

      {routine.notes && (
        <Card title="Routine notes" description="As written in Hevy.">
          <p className="text-sm leading-relaxed whitespace-pre-line">{routine.notes}</p>
        </Card>
      )}

      <Card
        title="Exercises"
        description={
          routine.lastPerformedAt
            ? `Last trained ${relativeDay(routine.lastPerformedAt)}. Each exercise shows what the routine prescribes, then what you actually lifted last time.`
            : "Nothing logged against this routine yet, so only the prescription is shown. Sync your history on the records page if you have trained it."
        }
      >
        <ul>
          {routine.exercises.map((exercise, index) => (
            <RoutineExercise key={`${exercise.templateId}-${index}`} exercise={exercise} />
          ))}
        </ul>
      </Card>
    </div>
  );
}

export default async function RoutinePage({ params }: PageProps<"/routines/[routineId]">) {
  const routineId = decodeURIComponent((await params).routineId);
  const client = await getHevyClient();

  if (!client) {
    return (
      <Missing title="In Hevy">
        <Card title="No API key" description={NO_KEY_MESSAGE}>
          <Link href="/settings" className="underline">
            Go to settings
          </Link>
        </Card>
      </Missing>
    );
  }

  let routine: RoutineDetail | null = null;
  let error: string | null = null;
  try {
    routine = await getRoutineDetail(client, routineId);
  } catch (caught) {
    // Hevy answering "no such routine" is the one failure that really is a 404;
    // everything else below is reported as a read error instead.
    if (caught instanceof HevyApiError && caught.status === 404) notFound();
    error = describeHevyError(caught, "read", "Could not read this routine from Hevy.");
  }

  // A read failure is NOT a 404: telling a user their routine does not exist
  // because the network hiccuped would be a lie, and an alarming one given
  // this API cannot delete anything.
  if (error) {
    return (
      <Missing title="Routine">
        <div className="ui-notice ui-notice--warn">{error}</div>
        <Link href="/routines" className="underline">
          Back to your routines
        </Link>
      </Missing>
    );
  }

  if (!routine) notFound();
  return <Detail routine={routine} />;
}
