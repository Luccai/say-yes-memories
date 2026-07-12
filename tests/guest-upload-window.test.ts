import { describe, expect, test } from "bun:test";
import { canAcceptGuestUpload } from "@/lib/storage/quota";

const wedding = {
  uploadsOpenAt: "2027-06-13T21:00:00.000Z",
  accessExpiresAt: "2027-09-14T20:59:59.999Z",
  storageQuotaBytes: 50 * 1024 ** 3,
  storageUsedBytes: 0,
  uploadLocked: false,
};

describe("guest upload opening boundary", () => {
  test("keeps the form closed before local wedding-day midnight", () => {
    expect(
      canAcceptGuestUpload(wedding, 0, new Date("2027-06-13T20:59:59.999Z")),
    ).toBe(false);
  });

  test("opens exactly at local wedding-day midnight", () => {
    expect(
      canAcceptGuestUpload(wedding, 0, new Date(wedding.uploadsOpenAt)),
    ).toBe(true);
  });
});
