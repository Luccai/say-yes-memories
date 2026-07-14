import { describe, expect, test } from "bun:test";
import {
  archiveAttemptCallbackSecret,
  archiveRequestSignature,
  verifyArchiveRequestSignature,
} from "@/lib/archives/signing";

const secret = "a".repeat(32);
const request = {
  method: "POST",
  path: "/api/internal/archives/archive_test/progress",
  body: '{"preparedMediaCount":2}',
  timestamp: "1784030400000",
};

describe("archive request signatures", () => {
  test("derives a different callback credential for every archive job", () => {
    const first = archiveAttemptCallbackSecret(
      secret,
      "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
      "attempt_aaaaaaaaaaaaaaaaaaaaaaaa",
    );
    const second = archiveAttemptCallbackSecret(
      secret,
      "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
      "attempt_bbbbbbbbbbbbbbbbbbbbbbbb",
    );

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });

  test("rejects invalid attempt ids before deriving a credential", () => {
    expect(() =>
      archiveAttemptCallbackSecret(
        secret,
        "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
        "attempt_invalid",
      ),
    ).toThrow("Archive attempt id is invalid.");
  });

  test("accepts the matching HMAC signature", () => {
    const signature = archiveRequestSignature({ ...request, secret });
    expect(
      verifyArchiveRequestSignature({
        ...request,
        secret,
        signature,
        now: new Date(Number(request.timestamp)),
      }),
    ).toBe(true);
  });

  test("rejects a changed request body and stale timestamps", () => {
    const signature = archiveRequestSignature({ ...request, secret });
    expect(
      verifyArchiveRequestSignature({
        ...request,
        secret,
        body: '{"preparedMediaCount":3}',
        signature,
        now: new Date(Number(request.timestamp)),
      }),
    ).toBe(false);
    expect(
      verifyArchiveRequestSignature({
        ...request,
        secret,
        signature,
        now: new Date(Number(request.timestamp) + 5 * 60 * 1000 + 1),
      }),
    ).toBe(false);
  });
});
