import { customType } from "drizzle-orm/mysql-core";

/**
 * A JSON column that parses regardless of how the driver reports the type.
 *
 * Background. Drizzle's mysql `json()` defines `mapToDriverValue` but NO
 * `mapFromDriverValue`: on read it trusts the driver to have parsed already.
 * On MySQL 8 that is safe, because `JSON` is a distinct protocol type (245)
 * that mysql2 auto-parses. MariaDB's `JSON` is only an alias for `LONGTEXT`
 * with a `JSON_VALID()` check, so the obvious worry is that the driver returns
 * a raw string and drizzle passes it straight through — which would fail
 * silently and late, at the first property access rather than at the query.
 *
 * MEASURED on MariaDB 12.3.2 + mysql2 3.23.2: the column is indeed reported as
 * protocol type 252 (LONGTEXT), not 245 — but mysql2 parses it anyway, via the
 * extended metadata MariaDB 10.5+ sends marking the column's format as JSON.
 * Both `query()` (text protocol) and `execute()` (binary, which is what drizzle
 * uses) returned an object. So the built-in `json()` would in fact work here.
 *
 * This type is kept because it does not depend on that path: an older MariaDB,
 * or any driver that ignores extended metadata, hands back the string. The
 * `typeof` branch below makes it a no-op when the driver has already parsed, so
 * it costs nothing and removes a version-dependent assumption.
 */
export const json = customType<{ data: unknown; driverData: string }>({
  dataType: () => "json",
  toDriver: (value) => JSON.stringify(value),
  fromDriver: (value) => (typeof value === "string" ? JSON.parse(value) : value),
});
