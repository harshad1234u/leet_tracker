import { describe, expect, it } from "vitest";
import { localDate, shiftDate, streakFromDates } from "../lib/time";

describe("timezone-aware streak calculations", () => {
  it("increments for consecutive completed days", () => expect(streakFromDates(["2026-08-14", "2026-08-15", "2026-08-16"], "2026-08-16")).toEqual({ current: 3, longest: 3 }));
  it("breaks current streak after a missed day", () => expect(streakFromDates(["2026-08-13", "2026-08-14", "2026-08-16"], "2026-08-16")).toEqual({ current: 1, longest: 2 }));
  it("does not reinterpret a local day in the server timezone", () => expect(localDate("America/Los_Angeles", new Date("2026-08-16T01:00:00Z"))).toBe("2026-08-15"));
  it("moves calendar dates safely across month boundaries", () => expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28"));
});
