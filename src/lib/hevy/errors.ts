import { UserFacingError } from "@/lib/errors";
import { HevyApiError } from "./client";

// Single translator from a thrown value to a message the UI may show.
//
// Two rules, both load-bearing:
//   1. Only HevyApiError (status-derived) and UserFacingError (written for the
//      user on purpose) produce specific text. Anything else becomes a generic
//      message — an arbitrary Error.message is an echo channel for secrets and
//      internals (see UserFacingError's comment).
//   2. The same HTTP status means different things per call site. 403 on an
//      auth check is a bad key; 403 on a routine write is the routine cap
//      (knowledge/concepts/hevy-api.md). The caller says which it is.

export type HevyCallContext = "auth" | "read" | "write";

const AUTH_HINT =
  "Hevy rejected the API key. Check it on the settings page — it must be a Hevy Pro developer key.";

function describeStatus(status: number, context: HevyCallContext): string {
  if (status === 401) return AUTH_HINT;

  if (status === 403) {
    // Only the write path can hit the routine cap; conflating the two would
    // send a user to re-check a key that was never the problem.
    return context === "write"
      ? "Hevy refused the write (403). This usually means the routine limit is reached — the API has no delete endpoint, so old routines have to be removed in the Hevy app."
      : AUTH_HINT;
  }

  if (status === 404) return "Hevy could not find that resource (404).";
  if (status === 429) return "Hevy is rate-limiting this key. Wait a moment and try again.";
  if (status >= 500) return `Hevy is having trouble (HTTP ${status}). Try again shortly.`;
  return `Hevy returned HTTP ${status}.`;
}

export function describeHevyError(
  error: unknown,
  context: HevyCallContext,
  fallback: string,
): string {
  if (error instanceof HevyApiError) return describeStatus(error.status, context);
  if (error instanceof UserFacingError) return error.message;

  // Reaching here means an error nobody anticipated. The user gets the generic
  // fallback (rule 1 above), but swallowing it entirely made a real bug
  // undiagnosable: "Catalog refresh failed." was the only trace of a MariaDB
  // ER_NO_DEFAULT_FOR_FIELD, and finding it needed a one-off repro harness.
  // The server log is not the browser, so it may hold the detail.
  console.error(`[hevy:${context}] unexpected error:`, error);
  return fallback;
}
