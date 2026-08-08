import { customType } from "drizzle-orm/mysql-core";

/**
 * A JSON column that parses reliably on MariaDB.
 *
 * WHY THIS EXISTS — do not replace it with drizzle's built-in `json()`.
 *
 * Drizzle's mysql `json()` defines `mapToDriverValue` but NO `mapFromDriverValue`:
 * on the way out it trusts the driver to have parsed the value already. That
 * holds on MySQL 8, where `JSON` is a distinct protocol type (245) that mysql2
 * auto-parses. It does NOT hold on MariaDB, where `JSON` is only an alias for
 * `LONGTEXT` with a `JSON_VALID()` check — the protocol reports it as text, so
 * mysql2 returns the raw string and drizzle passes it straight through.
 *
 * The failure is silent and late: `plans.request` comes back as a string, and
 * the first `row.request.sessionsPerWeek` throws at runtime rather than at the
 * query. Mapping both directions here makes the column behave the same on
 * MariaDB and MySQL.
 */
export const json = customType<{ data: unknown; driverData: string }>({
  dataType: () => "json",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) =>
    // Tolerate a driver that DID parse (MySQL 8, or mysql2 with typeCast on),
    // so this column is correct on either server rather than double-parsing.
    typeof value === "string" ? JSON.parse(value) : value,
});
