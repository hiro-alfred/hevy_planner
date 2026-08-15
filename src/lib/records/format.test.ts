import { describe, expect, it } from "vitest";
import { daysSince, formatDay, formatKg, relativeDay, setsLegend } from "./format";

// These run in whatever timezone the test process has, so every assertion is
// built from LOCAL date parts rather than from a UTC literal. A test written as
// `relativeDay("2026-08-14T20:00:00Z")` would pass in Tokyo and fail in London,
// which is exactly the class of bug this file exists to pin down.

/** An ISO instant at a given local wall-clock time, `daysAgo` days back. */
function localInstant(daysAgo: number, hour: number, minute = 0): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysAgo,
    hour,
    minute,
  ).toISOString();
}

describe("relativeDay", () => {
  it("calls yesterday evening 'yesterday', not 'today'", () => {
    // THE REPORTED BUG. Read at 10:00, a session finished at 20:00 the previous
    // evening is 14 hours old — under the old elapsed-hours division that
    // floored to 0 and printed "today".
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    expect(relativeDay(localInstant(1, 20), now)).toBe("yesterday");
  });

  it("still calls this morning 'today'", () => {
    const now = new Date();
    now.setHours(23, 0, 0, 0);
    expect(relativeDay(localInstant(0, 1), now)).toBe("today");
  });

  it("counts calendar days, not 24-hour blocks", () => {
    const now = new Date();
    now.setHours(9, 0, 0, 0);
    // 2 days back at 23:00 is ~34 hours ago: one 24-hour block, two calendar days.
    expect(relativeDay(localInstant(2, 23), now)).toBe("2 d ago");
  });

  it("walks up through the wider buckets", () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    expect(relativeDay(localInstant(6, 12), now)).toBe("6 d ago");
    expect(relativeDay(localInstant(20, 12), now)).toBe("2 wk ago");
    expect(relativeDay(localInstant(90, 12), now)).toBe("3 mo ago");
  });

  it("treats a future instant as today rather than going negative", () => {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    expect(relativeDay(localInstant(-1, 12), now)).toBe("today");
  });

  it("says 'unknown' for an unparseable date instead of 'NaN mo ago'", () => {
    expect(relativeDay("")).toBe("unknown");
    expect(relativeDay("not a date")).toBe("unknown");
  });
});

describe("daysSince", () => {
  it("agrees with the label relativeDay produces", () => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    // The records index colours a dot from this number and prints the label
    // from relativeDay; they must not disagree on the same row.
    expect(daysSince(localInstant(1, 20), now)).toBe(1);
    expect(relativeDay(localInstant(1, 20), now)).toBe("yesterday");
  });

  it("sorts an unparseable date to the stale end", () => {
    expect(daysSince("nonsense")).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe("formatDay", () => {
  it("prints the local calendar date, not the UTC one", () => {
    // An early-morning session east of UTC carries the PREVIOUS day's UTC date,
    // which the old slice(0, 10) printed verbatim.
    const iso = localInstant(0, 7);
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate(),
    ).padStart(2, "0")}`;
    expect(formatDay(iso)).toBe(expected);
  });

  it("agrees with relativeDay about which day it was", () => {
    const now = new Date();
    now.setHours(10, 0, 0, 0);
    const iso = localInstant(1, 22);
    expect(relativeDay(iso, now)).toBe("yesterday");
    expect(formatDay(iso)).not.toBe(formatDay(new Date().toISOString()));
  });

  it("falls back to the raw slice for an unparseable date", () => {
    expect(formatDay("garbage-in")).toBe("garbage-in");
  });
});

describe("formatKg", () => {
  it("trims a trailing .0 but keeps a real decimal", () => {
    expect(formatKg(100)).toBe("100");
    expect(formatKg(102.5)).toBe("102.5");
    expect(formatKg(null)).toBe("—");
  });
});

describe("setsLegend", () => {
  it("names only the metrics the sets actually carry", () => {
    expect(setsLegend([{ weightKg: 100, reps: 5 }])).toBe("kg × reps");
    expect(setsLegend([{ weightKg: null, reps: 12 }])).toBe("reps");
    expect(setsLegend([{ weightKg: 60, reps: null }])).toBe("kg");
    expect(setsLegend([{ weightKg: null, reps: null }])).toBe("");
  });
});
