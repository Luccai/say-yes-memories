import { describe, expect, test } from "bun:test";
import {
  validateCleanupApproval,
  validateOwnerIdentityUpdate,
  validateOwnerPasswordChange,
  validateTokenIssue,
} from "@/lib/owner/actions";
import { normalizeOwnerNonNegativeInteger } from "@/lib/owner/numbers";

describe("owner action validation", () => {
  test("requires a stable operation key for retry-safe writes", () => {
    expect(
      validateTokenIssue({ label: "Etsy Temmuz", operationKey: "short" }),
    ).toEqual({ ok: false, code: "INVALID_OPERATION_KEY" });
    expect(
      validateTokenIssue({
        label: "Etsy Temmuz",
        operationKey: "owner-token-issue_12345678",
      }).ok,
    ).toBeTrue();
  });

  test("accepts owner-only name and historical wedding-date corrections", () => {
    const result = validateOwnerIdentityUpdate({
      brideName: "Fatma",
      groomName: "Mihail",
      eventDate: "2025-06-20",
      timezone: "Europe/Istanbul",
      note: "Etsy mesajıyla doğrulandı",
      operationKey: "owner-identity-change_12345678",
    });

    expect(result.ok).toBeTrue();
    if (result.ok) {
      expect(result.value.baseSlug).toBe("fatma-mihail");
    }
  });

  test("requires the current password and matching new owner passwords", () => {
    expect(
      validateOwnerPasswordChange({
        currentPassword: "owner passphrase 2026",
        password: "new owner passphrase 2026",
        passwordConfirm: "different owner passphrase",
        deviceLabel: "Laptop",
        operationKey: "owner-password-change_12345678",
      }),
    ).toEqual({ ok: false, code: "PASSWORD_MISMATCH" });
  });

  test("requires the exact visible slug for destructive cleanup approval", () => {
    expect(
      validateCleanupApproval(
        {
          confirmation: "fatma-mihail",
          operationKey: "owner-cleanup_12345678",
        },
        "fatma-mihail",
      ).ok,
    ).toBeTrue();
    expect(
      validateCleanupApproval(
        {
          confirmation: "fatma & mihail",
          operationKey: "owner-cleanup_12345678",
        },
        "fatma-mihail",
      ),
    ).toEqual({ ok: false, code: "CONFIRMATION_MISMATCH" });
  });

  test("normalizes bigint RPC values before the cleanup result reaches the UI", () => {
    expect(normalizeOwnerNonNegativeInteger("5368709120", "bytes_queued")).toBe(
      5_368_709_120,
    );
    expect(() => normalizeOwnerNonNegativeInteger("not-a-number", "bytes_queued")).toThrow(
      "bytes_queued returned an invalid number.",
    );
  });
});
