import { beforeEach, describe, expect, test } from "bun:test";
import type { Wedding } from "@/lib/types";
import { hashUploadSecret } from "@/lib/uploads/security";
import { createReservationPost } from "../src/app/api/uploads/[slug]/reservations/route";
import { createReservationCompletePost } from "../src/app/api/uploads/[slug]/reservations/[reservationId]/complete/route";

const secret = `sy_upload_${"a".repeat(43)}`;
const secretHash = hashUploadSecret(secret);
const calls: string[] = [];
let promoteCalls = 0;
let completeCalls = 0;
let multipartCompleteCalls = 0;
let finalAlreadyPromoted = false;
let storedParts: Array<{
  reservationId: string;
  partNumber: number;
  etag: string;
  byteSize: number;
  uploadedAt: string;
}> = [];

const wedding: Wedding = {
  id: "wed_upload_test",
  slug: "alice-bob",
  studioCode: "SY-TEST-0001",
  plan: "classic",
  storageQuotaBytes: 50 * 1024 ** 3,
  storageUsedBytes: 0,
  brideName: "Alice",
  groomName: "Bob",
  coupleName: "Alice & Bob",
  realtimeTopic: "topic-test",
  welcomeNote: "Welcome",
  uploadLocked: false,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

function reservation(
  status: "pending" | "uploading" | "completed" | "aborted" | "expired",
  mode: "single" | "multipart" = "single",
) {
  return {
    id: "upload_aaaaaaaaaaaaaaaaaaaaaaaa",
    weddingId: wedding.id,
    clientRequestKeyHash: "b".repeat(64),
    secretHash,
    mediaId: "asset_bbbbbbbbbbbbbbbbbbbbbbbb",
    mode,
    status,
    objectPath:
      "weddings/wed_upload_test/guest/asset_bbbbbbbbbbbbbbbbbbbbbbbb-memory.jpg",
    stagingObjectPath:
      "weddings/wed_upload_test/upload-staging/upload_aaaaaaaaaaaaaaaaaaaaaaaa-memory.jpg",
    thumbnailPath: null,
    thumbnailStagingPath: null,
    r2UploadId: null as string | null,
    kind: "image" as const,
    mimeType: "image/jpeg",
    fileName: "memory.jpg",
    byteSize: 1024,
    partSizeBytes: 1024,
    partCount: 1,
    thumbnailMimeType: null,
    thumbnailFileName: null,
    thumbnailByteSize: null,
    guestName: "Guest",
    note: null,
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-07-12T00:00:00.000Z",
    lastActivityAt: "2026-07-12T00:00:00.000Z",
    completedAt:
      status === "completed" ? "2026-07-12T00:01:00.000Z" : null,
    abortedAt: null,
    thumbnailCompletedAt: null,
    storageCleanedAt: null,
    storageCleanupAttempts: 0,
    storageCleanupError: null,
  };
}

let storedReservation = reservation("pending");

const prepareReservation = createReservationPost({
  verifyTurnstile: async () => {
    calls.push("turnstile");
    return { success: true, hostname: "localhost" };
  },
  resolveWeddingRecordBySlug: async () => ({
    wedding,
    canonicalSlug: wedding.slug,
    isAlias: false,
  }),
  reserveGuestUpload: async (input) => {
    calls.push("reserve");
    storedReservation = { ...reservation("pending"), secretHash: input.secretHash };
    return storedReservation;
  },
  getUploadReservation: async (_id, providedSecretHash) =>
    providedSecretHash === secretHash ? storedReservation : null,
  attachMultipartUpload: async () => storedReservation,
  abortUploadReservation: async () => ({
    ...storedReservation,
    status: "aborted" as const,
  }),
  createMultipartR2Upload: async () => "private-r2-upload-id",
  abortMultipartR2Upload: async () => undefined,
  createReservationSignedTarget: async () => ({
    uploadUrl: "https://signed.example/upload",
    method: "PUT" as const,
    headers: { "Content-Type": "image/jpeg" },
  }),
  deleteStoredFile: async () => undefined,
});

const completeReservation = createReservationCompletePost({
  resolveWeddingRecordBySlug: async () => ({
    wedding,
    canonicalSlug: wedding.slug,
    isAlias: false,
  }),
  broadcastWeddingMediaChange: async () => undefined,
  completeMultipartR2Upload: async () => {
    multipartCompleteCalls += 1;
  },
  deleteStoredFile: async () => undefined,
  headR2Object: async (storagePath) =>
    finalAlreadyPromoted && storagePath === storedReservation.objectPath
      ? {
          exists: true as const,
          byteSize: storedReservation.byteSize,
          etag: '"final"',
          mimeType: storedReservation.mimeType,
        }
      : { exists: false as const },
  promoteStagedObject: async () => {
    promoteCalls += 1;
  },
  completeUploadReservation: async () => {
    completeCalls += 1;
    return {
      id: storedReservation.mediaId,
      created_at: "2026-07-12T00:01:00.000Z",
    };
  },
  listUploadParts: async (_id, providedSecretHash) =>
    providedSecretHash === secretHash
      ? { reservation: storedReservation, parts: storedParts }
      : null,
});

beforeEach(() => {
  calls.length = 0;
  promoteCalls = 0;
  completeCalls = 0;
  multipartCompleteCalls = 0;
  finalAlreadyPromoted = false;
  storedParts = [];
  storedReservation = reservation("pending");
});

function authRequest(providedSecret = secret) {
  return new Request(
    "http://localhost/api/uploads/alice-bob/reservations/upload_aaaaaaaaaaaaaaaaaaaaaaaa/complete",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${providedSecret}` },
    },
  );
}

describe("secure upload reservation routes", () => {
  test("verifies Turnstile before reserving and never exposes internal R2 paths", async () => {
    const response = await prepareReservation(
      new Request("http://localhost/api/uploads/alice-bob/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestKey: `request_${"b".repeat(43)}`,
          reservationSecret: secret,
          turnstileToken: "valid-token",
          guestName: "Guest",
          fileName: "memory.jpg",
          mimeType: "image/jpeg",
          byteSize: 1024,
        }),
      }),
      { params: Promise.resolve({ slug: wedding.slug }) },
    );

    expect(response.status).toBe(200);
    expect(calls.slice(0, 2)).toEqual(["turnstile", "reserve"]);
    const body = await response.text();
    expect(body).not.toContain("stagingObjectPath");
    expect(body).not.toContain("objectPath");
    expect(body).not.toContain("private-r2-upload-id");
  });

  test("a completion replay cannot promote or overwrite the final object", async () => {
    storedReservation = reservation("completed");
    const response = await completeReservation(authRequest(), {
      params: Promise.resolve({
        slug: wedding.slug,
        reservationId: storedReservation.id,
      }),
    });

    expect(response.status).toBe(200);
    expect(promoteCalls).toBe(0);
    expect(completeCalls).toBe(1);
    const body = await response.text();
    expect(body).not.toContain(storedReservation.objectPath);
    expect(body).not.toContain(storedReservation.stagingObjectPath);
  });

  test("resumes after a multipart object was promoted before the database commit", async () => {
    storedReservation = {
      ...reservation("uploading"),
      mode: "multipart",
      r2UploadId: "private-r2-upload-id",
      byteSize: 2048,
      partSizeBytes: 1024,
      partCount: 2,
    };
    storedParts = [1, 2].map((partNumber) => ({
      reservationId: storedReservation.id,
      partNumber,
      etag: `"etag-${partNumber}"`,
      byteSize: 1024,
      uploadedAt: "2026-07-12T00:00:00.000Z",
    }));
    finalAlreadyPromoted = true;

    const response = await completeReservation(authRequest(), {
      params: Promise.resolve({
        slug: wedding.slug,
        reservationId: storedReservation.id,
      }),
    });

    expect(response.status).toBe(200);
    expect(multipartCompleteCalls).toBe(0);
    expect(promoteCalls).toBe(1);
    expect(completeCalls).toBe(1);
  });

  test("a foreign reservation secret is rejected before storage changes", async () => {
    const response = await completeReservation(
      authRequest(`sy_upload_${"z".repeat(43)}`),
      {
        params: Promise.resolve({
          slug: wedding.slug,
          reservationId: storedReservation.id,
        }),
      },
    );

    expect(response.status).toBe(404);
    expect(promoteCalls).toBe(0);
    expect(completeCalls).toBe(0);
  });
});
