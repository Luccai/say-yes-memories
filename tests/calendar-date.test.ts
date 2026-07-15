import { describe, expect, test } from "bun:test";
import {
  calendarDateFromIso,
  calendarDateToIso,
} from "@/lib/calendar-date";

describe("calendar date values", () => {
  test("round-trips calendar days without a timezone shift", () => {
    const selected = calendarDateFromIso("2028-02-29");

    expect(selected).toBeDefined();
    expect(calendarDateToIso(selected!)).toBe("2028-02-29");
  });

  test("rejects malformed and impossible calendar dates", () => {
    expect(calendarDateFromIso("2027-02-29")).toBeUndefined();
    expect(calendarDateFromIso("2027-2-09")).toBeUndefined();
    expect(calendarDateFromIso("not-a-date")).toBeUndefined();
  });
});
