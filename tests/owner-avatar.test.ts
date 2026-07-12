import { describe, expect, test } from "bun:test";
import { shouldShowOwnerProfile } from "@/components/owner/avatar-state";

describe("owner couple avatar", () => {
  test("falls back after the current profile source fails and retries a new source", () => {
    const currentSource = "/api/owner/couples/wed_one/profile";

    expect(shouldShowOwnerProfile(true, currentSource, "")).toBe(true);
    expect(shouldShowOwnerProfile(true, currentSource, currentSource)).toBe(false);
    expect(
      shouldShowOwnerProfile(
        true,
        "/api/owner/couples/wed_two/profile",
        currentSource,
      ),
    ).toBe(true);
  });

  test("uses initials immediately when no profile is recorded", () => {
    expect(
      shouldShowOwnerProfile(
        false,
        "/api/owner/couples/wed_one/profile",
        "",
      ),
    ).toBe(false);
  });
});
