import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { UserFacingError } from "@/lib/errors";

// Typed accessors over the settings key-value table.
//
// SECURITY: the Hevy API key is the one secret this app holds. It is stored in
// plaintext by decision (encryption at rest is theater on a single-user box —
// see knowledge/decisions/plan-pipeline.md), so the protections that DO matter
// are enforced here:
//   - "server-only" import: this module can never be pulled into a client bundle
//   - the raw key is never returned to a React component; UI code gets
//     HevyKeyStatus (a boolean + last 4 chars) instead
//   - the key is never logged, and never interpolated into an error message

export const SETTING_KEYS = {
  hevyApiKey: "hevy_api_key",
  weightUnit: "weight_unit",
} as const;

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  // MySQL/MariaDB upsert. There is no conflict target to name: the clause fires
  // on any unique-key collision, which for this table is only the primary key.
  const updatedAt = new Date().toISOString();
  await db
    .insert(settings)
    .values({ key, value, updatedAt })
    .onDuplicateKeyUpdate({ set: { value, updatedAt } });
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

/**
 * The Hevy API key, or null when none is configured.
 *
 * SERVER USE ONLY — never return this value from a server action or pass it
 * into a component's props. The stored key wins over the env fallback so that
 * changing it in the UI takes effect without a redeploy.
 */
export async function getHevyApiKey(): Promise<string | null> {
  const stored = await getSetting(SETTING_KEYS.hevyApiKey);
  if (stored) return stored;
  const fromEnv = process.env.HEVY_API_KEY?.trim();
  return fromEnv ? fromEnv : null;
}

/**
 * A key must be printable ASCII with no whitespace.
 *
 * Not cosmetic: an interior newline makes the fetch layer reject the header
 * with the whole value quoted in the exception message. Refusing the value here
 * means that message can never be produced in the first place.
 */
const KEY_PATTERN = /^[\x21-\x7e]+$/;

/** Never reveal the whole secret: a key too short to mask shows nothing. */
function maskLast4(value: string): string | null {
  return value.length > 4 ? value.slice(-4) : null;
}

export interface HevyKeyStatus {
  configured: boolean;
  /** Last 4 characters, for a "····abcd" display. Null when not maskable. */
  last4: string | null;
  /** True when the key comes from HEVY_API_KEY rather than the settings table. */
  fromEnv: boolean;
  updatedAt: string | null;
}

/** The only shape of key information allowed to reach the UI. */
export async function getHevyKeyStatus(): Promise<HevyKeyStatus> {
  const [row] = await db
    .select({ value: settings.value, updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.key, SETTING_KEYS.hevyApiKey))
    .limit(1);

  if (row?.value) {
    return {
      configured: true,
      last4: maskLast4(row.value),
      fromEnv: false,
      updatedAt: row.updatedAt,
    };
  }

  const fromEnv = process.env.HEVY_API_KEY?.trim();
  if (fromEnv) {
    return { configured: true, last4: maskLast4(fromEnv), fromEnv: true, updatedAt: null };
  }
  return { configured: false, last4: null, fromEnv: false, updatedAt: null };
}

/**
 * Validates and normalises a submitted key.
 *
 * Callers must run this BEFORE handing the value to HevyClient — the point is
 * to stop a malformed key from ever reaching the fetch layer, which would throw
 * with the value quoted in its message.
 */
export function normalizeHevyApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed === "") throw new UserFacingError("Enter an API key.");
  if (!KEY_PATTERN.test(trimmed)) {
    // Deliberately does not quote the offending value.
    throw new UserFacingError(
      "That does not look like an API key — it contains spaces or control characters.",
    );
  }
  return trimmed;
}

export async function setHevyApiKey(key: string): Promise<void> {
  await setSetting(SETTING_KEYS.hevyApiKey, normalizeHevyApiKey(key));
}

/** Removes the stored key. An env-provided key, if any, becomes active again. */
export async function clearHevyApiKey(): Promise<void> {
  await deleteSetting(SETTING_KEYS.hevyApiKey);
}

export type WeightUnit = "kg" | "lbs";

/**
 * Display unit. kg is the only INTERNAL unit (it is what the Hevy API speaks);
 * lbs is a display-only conversion applied in UI components, nowhere else.
 */
export async function getWeightUnit(): Promise<WeightUnit> {
  return (await getSetting(SETTING_KEYS.weightUnit)) === "lbs" ? "lbs" : "kg";
}

export async function setWeightUnit(unit: WeightUnit): Promise<void> {
  await setSetting(SETTING_KEYS.weightUnit, unit);
}
