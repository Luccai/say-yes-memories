import { describe, expect, test } from "bun:test";
import {
  CLASSIC_QUOTA_BYTES,
  EXTENSION_QUOTA_BYTES,
  calculateEntitlementProjection,
  getAccessState,
} from "@/lib/domain/entitlements";
import { allocateWeddingSlug } from "@/lib/domain/slugs";

describe("wedding slug allocation", () => {
  test("keeps the Mary & John demo slug reserved", () => {
    expect(allocateWeddingSlug("mary-john", new Set())).toBe("mary-john-2");
  });

  test("keeps application routes out of the guest-page namespace", () => {
    for (const route of ["login", "admin", "owner", "api"]) {
      expect(allocateWeddingSlug(route, new Set())).toBe(`${route}-2`);
    }
  });

  test("uses one namespace for canonical slugs and aliases", () => {
    const taken = new Set(["fatma-mihail", "fatma-mihail-2", "fatma-mihail-3"]);
    expect(allocateWeddingSlug("fatma-mihail", taken)).toBe("fatma-mihail-4");
  });

  test("returns the base slug when it is available", () => {
    expect(allocateWeddingSlug("alice-bob", new Set(["alice-charlie"]))).toBe(
      "alice-bob",
    );
  });

  test("keeps suffixed slugs inside the database limit", () => {
    const longBase = "a".repeat(64);
    const allocated = allocateWeddingSlug(longBase, new Set([longBase]));

    expect(allocated).toBe(`${"a".repeat(62)}-2`);
    expect(allocated.length).toBe(64);
  });
});

describe("entitlement projection", () => {
  test("opens at local midnight and grants Classic for three calendar months", () => {
    const projection = calculateEntitlementProjection({
      eventDate: "2027-06-14",
      timezone: "Europe/Istanbul",
      events: [],
    });

    expect(projection.uploadsOpenAt).toBe("2027-06-13T21:00:00.000Z");
    expect(projection.accessExpiresAt).toBe("2027-09-14T20:59:59.999Z");
    expect(projection.cleanupAfter).toBe("2027-10-14T20:59:59.999Z");
    expect(projection.storageQuotaBytes).toBe(CLASSIC_QUOTA_BYTES);
    expect(projection.extensionCount).toBe(0);
  });

  test("preserves every paid six-month extension in chronological order", () => {
    const projection = calculateEntitlementProjection({
      eventDate: "2027-06-14",
      timezone: "Europe/Istanbul",
      events: [
        {
          id: "ent_1",
          type: "premium_extension",
          appliedAt: "2027-07-01T09:00:00.000Z",
          quotaDeltaBytes: EXTENSION_QUOTA_BYTES,
          accessDeltaMonths: 6,
        },
        {
          id: "ent_2",
          type: "premium_extension",
          appliedAt: "2027-08-01T09:00:00.000Z",
          quotaDeltaBytes: EXTENSION_QUOTA_BYTES,
          accessDeltaMonths: 6,
        },
      ],
    });

    expect(projection.accessExpiresAt).toBe("2028-09-14T20:59:59.999Z");
    expect(projection.storageQuotaBytes).toBe(
      CLASSIC_QUOTA_BYTES + EXTENSION_QUOTA_BYTES * 2,
    );
    expect(projection.extensionCount).toBe(2);
  });

  test("starts an extension from the owner application day after expiry", () => {
    const projection = calculateEntitlementProjection({
      eventDate: "2027-06-14",
      timezone: "Europe/Istanbul",
      events: [
        {
          id: "ent_late",
          type: "premium_extension",
          appliedAt: "2028-12-01T10:00:00.000Z",
          quotaDeltaBytes: EXTENSION_QUOTA_BYTES,
          accessDeltaMonths: 6,
        },
      ],
    });

    expect(projection.accessExpiresAt).toBe("2029-06-01T20:59:59.999Z");
    expect(projection.cleanupAfter).toBe("2029-07-01T20:59:59.999Z");
  });

  test("replays paid extensions when the owner changes the event date", () => {
    const events = [
      {
        id: "ent_1",
        type: "premium_extension" as const,
        appliedAt: "2027-07-01T09:00:00.000Z",
        quotaDeltaBytes: EXTENSION_QUOTA_BYTES,
        accessDeltaMonths: 6,
      },
    ];

    const before = calculateEntitlementProjection({
      eventDate: "2027-06-14",
      timezone: "Europe/Istanbul",
      events,
    });
    const after = calculateEntitlementProjection({
      eventDate: "2027-08-20",
      timezone: "Europe/Istanbul",
      events,
    });

    expect(before.accessExpiresAt).toBe("2028-03-14T20:59:59.999Z");
    expect(after.accessExpiresAt).toBe("2028-05-20T20:59:59.999Z");
    expect(after.extensionCount).toBe(1);
    expect(after.storageQuotaBytes).toBe(
      CLASSIC_QUOTA_BYTES + EXTENSION_QUOTA_BYTES,
    );
  });

  test("excludes a reversed extension without deleting its history", () => {
    const projection = calculateEntitlementProjection({
      eventDate: "2027-06-14",
      timezone: "Europe/Istanbul",
      events: [
        {
          id: "ent_1",
          type: "premium_extension",
          appliedAt: "2027-07-01T09:00:00.000Z",
          quotaDeltaBytes: EXTENSION_QUOTA_BYTES,
          accessDeltaMonths: 6,
        },
        {
          id: "ent_reverse",
          type: "reversal",
          appliedAt: "2027-07-02T09:00:00.000Z",
          quotaDeltaBytes: -EXTENSION_QUOTA_BYTES,
          accessDeltaMonths: -6,
          reversesEventId: "ent_1",
        },
      ],
    });

    expect(projection.accessExpiresAt).toBe("2027-09-14T20:59:59.999Z");
    expect(projection.storageQuotaBytes).toBe(CLASSIC_QUOTA_BYTES);
    expect(projection.extensionCount).toBe(0);
  });

  test("reports preparation, upload, grace and cleanup states at boundaries", () => {
    const projection = calculateEntitlementProjection({
      eventDate: "2027-06-14",
      timezone: "Europe/Istanbul",
      events: [],
    });

    expect(getAccessState(projection, "2027-06-13T20:59:59.999Z")).toBe(
      "pre_event",
    );
    expect(getAccessState(projection, projection.uploadsOpenAt)).toBe("open");
    expect(getAccessState(projection, projection.accessExpiresAt)).toBe("open");
    expect(getAccessState(projection, "2027-09-14T21:00:00.000Z")).toBe(
      "download_only",
    );
    expect(getAccessState(projection, projection.cleanupAfter)).toBe(
      "download_only",
    );
    expect(getAccessState(projection, "2027-10-14T21:00:00.000Z")).toBe(
      "cleanup_eligible",
    );
  });

  test("rejects invalid dates and timezones", () => {
    expect(() =>
      calculateEntitlementProjection({
        eventDate: "2027-02-30",
        timezone: "Europe/Istanbul",
        events: [],
      }),
    ).toThrow("Invalid event date");

    expect(() =>
      calculateEntitlementProjection({
        eventDate: "2027-06-14",
        timezone: "Mars/Olympus",
        events: [],
      }),
    ).toThrow("Invalid timezone");
  });

  test("uses calendar months at month-end and leap-day boundaries", () => {
    const monthEnd = calculateEntitlementProjection({
      eventDate: "2027-01-31",
      timezone: "UTC",
      events: [],
    });
    const leapDay = calculateEntitlementProjection({
      eventDate: "2028-02-29",
      timezone: "UTC",
      events: [],
    });

    expect(monthEnd.accessExpiresAt).toBe("2027-04-30T23:59:59.999Z");
    expect(leapDay.accessExpiresAt).toBe("2028-05-29T23:59:59.999Z");
  });
});
