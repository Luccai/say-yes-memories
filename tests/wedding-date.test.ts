import { describe, expect, test } from "bun:test";
import { formatWeddingDate } from "@/lib/wedding-date";

describe("wedding date display", () => {
  test("uses the visitor locale instead of exposing the stored ISO date", () => {
    expect(formatWeddingDate("2027-06-14", "en")).toBe("June 14, 2027");
    expect(formatWeddingDate("2027-06-14", "de")).toBe("14. Juni 2027");
    expect(formatWeddingDate("2027-06-14", "fr")).toBe("14 juin 2027");
  });
});
