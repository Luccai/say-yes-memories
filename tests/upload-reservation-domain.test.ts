import { describe, expect, test } from "bun:test";
import {
  MAX_GUEST_UPLOAD_BYTES,
  MULTIPART_PART_BYTES,
  SINGLE_UPLOAD_MAX_BYTES,
  expectedPartByteSize,
  planGuestUpload,
  validateGuestUploadInput,
} from "@/lib/uploads/domain";
import {
  deriveUploadIdentity,
  hashUploadRequestKey,
  hashUploadSecret,
} from "@/lib/uploads/security";

describe("guest upload planning", () => {
  test("uses a single temporary object through 100 MiB", () => {
    expect(planGuestUpload(SINGLE_UPLOAD_MAX_BYTES)).toEqual({
      mode: "single",
      partCount: 1,
      partSizeBytes: SINGLE_UPLOAD_MAX_BYTES,
    });
  });

  test("uses 64 MiB multipart chunks above 100 MiB through 5 GiB", () => {
    expect(planGuestUpload(SINGLE_UPLOAD_MAX_BYTES + 1)).toEqual({
      mode: "multipart",
      partCount: 2,
      partSizeBytes: MULTIPART_PART_BYTES,
    });
    expect(planGuestUpload(MAX_GUEST_UPLOAD_BYTES)).toEqual({
      mode: "multipart",
      partCount: 80,
      partSizeBytes: MULTIPART_PART_BYTES,
    });
    expect(() => planGuestUpload(MAX_GUEST_UPLOAD_BYTES + 1)).toThrow(
      "Files can be up to 5 GiB.",
    );
  });

  test("computes the exact final part without reserving extra quota", () => {
    const byteSize = MULTIPART_PART_BYTES * 2 + 17;
    expect(expectedPartByteSize(byteSize, 3, 1)).toBe(MULTIPART_PART_BYTES);
    expect(expectedPartByteSize(byteSize, 3, 2)).toBe(MULTIPART_PART_BYTES);
    expect(expectedPartByteSize(byteSize, 3, 3)).toBe(17);
  });
});

describe("guest upload input", () => {
  const valid = {
    requestKey: "upload_request_1234567890",
    reservationSecret: `sy_upload_${"a".repeat(43)}`,
    turnstileToken: "turnstile-token",
    guestName: "Emma",
    note: "A lovely moment",
    fileName: "IMG_1024.HEIC",
    mimeType: "image/heic",
    byteSize: 12_345,
  };

  test("accepts common phone photo, video and audio types", () => {
    expect(validateGuestUploadInput(valid).file.kind).toBe("image");
    expect(
      validateGuestUploadInput({
        ...valid,
        fileName: "wedding.mov",
        mimeType: "video/quicktime",
      }).file.kind,
    ).toBe("video");
    expect(
      validateGuestUploadInput({
        ...valid,
        fileName: "voice.m4a",
        mimeType: "audio/x-m4a",
      }).file.kind,
    ).toBe("audio");
  });

  test("rejects non-media, SVG, invalid secrets and oversized files", () => {
    expect(() =>
      validateGuestUploadInput({ ...valid, fileName: "invoice.pdf", mimeType: "application/pdf" }),
    ).toThrow("Only supported photo, video, or audio files are accepted.");
    expect(() =>
      validateGuestUploadInput({ ...valid, fileName: "image.svg", mimeType: "image/svg+xml" }),
    ).toThrow("Only supported photo, video, or audio files are accepted.");
    expect(() => validateGuestUploadInput({ ...valid, reservationSecret: "short" })).toThrow(
      "Upload secret is invalid.",
    );
    expect(() => validateGuestUploadInput({ ...valid, byteSize: MAX_GUEST_UPLOAD_BYTES + 1 })).toThrow(
      "Files can be up to 5 GiB.",
    );
  });
});

describe("upload reservation secrets", () => {
  test("derives stable retry ids while storing only hashes", () => {
    const requestKey = "upload_request_1234567890";
    const secret = `sy_upload_${"z".repeat(43)}`;
    const first = deriveUploadIdentity(requestKey);
    const retry = deriveUploadIdentity(requestKey);

    expect(first).toEqual(retry);
    expect(first.reservationId).toMatch(/^upload_[a-f0-9]{24}$/);
    expect(first.mediaId).toMatch(/^asset_[a-f0-9]{24}$/);
    expect(hashUploadRequestKey(requestKey)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUploadSecret(secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashUploadSecret(secret)).not.toContain(secret);
  });
});
