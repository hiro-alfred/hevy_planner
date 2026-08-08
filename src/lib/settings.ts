import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

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
  await db
    .insert(settings)
    .values({ key, value, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date().toISOString() },
    });
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

export interface HevyKeyStatus {
  configured: boolean;
  /** Last 4 characters, for a "····abcd" display. Null when not configured. */
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
      last4: row.value.slice(-4),
      fromEnv: false,
      updatedAt: row.updatedAt,
    };
  }

  const fromEnv = process.env.HEVY_API_KEY?.trim();
  if (fromEnv) {
    return { configured: true, last4: fromEnv.slice(-4), fromEnv: true, updatedAt: null };
  }
  return { configured: false, last4: null, fromEnv: false, updatedAt: null };
}

export async function setHevyApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (trimmed === "") throw new Error("API key must not be empty");
  await setSetting(SETTING_KEYS.hevyApiKey, trimmed);
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
