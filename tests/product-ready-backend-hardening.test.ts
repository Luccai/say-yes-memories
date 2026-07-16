import { describe, expect, test } from "bun:test";
import {
  mediaSignatureMatches,
  safeDownloadFileName,
  validateGuestUploadInput,
} from "@/lib/uploads/domain";
import { isTrustedMutationRequest } from "@/lib/security/same-origin";
import { parseCustomerWeddingUpdate } from "@/lib/weddings/customer-update";
import { classifyUploadError } from "@/lib/uploads/http";

function uploadInput(overrides: Record<string, unknown> = {}) {
  return {
    requestKey: "request-key-12345678901234567890",
    reservationSecret: `sy_upload_${"a".repeat(43)}`,
    turnstileToken: "turnstile-token",
    guestName: "Guest",
    note: "",
    fileName: "memory.jpg",
    mimeType: "image/jpeg",
    byteSize: 1024,
    ...overrides,
  };
}

describe("product-ready backend hardening", () => {
  test("rejects executable file extensions even when the client claims an image MIME", () => {
    expect(() =>
      validateGuestUploadInput(uploadInput({ fileName: "wedding-photos.exe" })),
    ).toThrow("extension");
  });

  test("checks media magic bytes and never trusts the declared MIME alone", () => {
    expect(
      mediaSignatureMatches(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg"),
    ).toBe(true);
    expect(
      mediaSignatureMatches(new TextEncoder().encode("MZ executable"), "image/jpeg"),
    ).toBe(false);
  });

  test("derives the attachment extension from the verified MIME type", () => {
    expect(safeDownloadFileName("wedding.exe", "image/jpeg")).toBe("wedding.jpg");
    expect(safeDownloadFileName("../../memory", "video/mp4")).toBe("memory.mp4");
  });

  test("rejects foreign and sibling-origin browser mutations", () => {
    expect(
      isTrustedMutationRequest(
        new Request("https://app.example.com/api/weddings/current", {
          method: "PATCH",
          headers: {
            Origin: "https://evil.example.com",
            "Sec-Fetch-Site": "same-site",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedMutationRequest(
        new Request("https://app.example.com/api/weddings/current", {
          method: "PATCH",
          headers: {
            Origin: "https://app.example.com",
            "Sec-Fetch-Site": "same-origin",
          },
        }),
      ),
    ).toBe(true);
  });

  test("keeps server-to-server signed mutations working without browser headers", () => {
    expect(
      isTrustedMutationRequest(
        new Request("https://app.example.com/api/internal/archives/job/progress", {
          method: "POST",
        }),
      ),
    ).toBe(true);
  });

  test("bounds the customer welcome note on the server", () => {
    expect(() => parseCustomerWeddingUpdate({ welcomeNote: "x".repeat(2001) })).toThrow(
      "2,000",
    );
  });

  test("returns an explicit 429 when an upload source exhausts its outstanding budget", () => {
    expect(classifyUploadError(new Error("Upload rate limit exceeded.")).status).toBe(429);
  });
});
