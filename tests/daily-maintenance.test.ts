import { beforeEach, describe, expect, test } from "bun:test";
import { runDailyMaintenance } from "@/lib/maintenance/daily";

type MaintenanceOverrides = NonNullable<
  Parameters<typeof runDailyMaintenance>[0]
>;

const releasedReservation = {
  id: "upload_aaaaaaaaaaaaaaaaaaaaaaaa",
  weddingId: "wed_test",
  clientRequestKeyHash: "a".repeat(64),
  secretHash: "b".repeat(64),
  mediaId: "asset_bbbbbbbbbbbbbbbbbbbbbbbb",
  mode: "multipart" as const,
  status: "expired" as const,
  objectPath: "weddings/wed_test/guest/final.jpg",
  stagingObjectPath: "weddings/wed_test/upload-staging/file.jpg",
  thumbnailPath: null,
  thumbnailStagingPath: "weddings/wed_test/upload-staging/thumb.jpg",
  r2UploadId: "r2-upload-id",
  kind: "image" as const,
  mimeType: "image/jpeg",
  fileName: "file.jpg",
  byteSize: 1024,
  partSizeBytes: 1024,
  partCount: 1,
  thumbnailMimeType: null,
  thumbnailFileName: null,
  thumbnailByteSize: null,
  guestName: "Guest",
  note: null,
  expiresAt: "2026-07-11T00:00:00.000Z",
  createdAt: "2026-07-10T00:00:00.000Z",
  lastActivityAt: "2026-07-10T00:00:00.000Z",
  completedAt: null,
  abortedAt: "2026-07-11T00:00:00.000Z",
  thumbnailCompletedAt: null,
  storageCleanedAt: null,
  storageCleanupAttempts: 0,
  storageCleanupError: null,
};

const deletionJob = {
  id: "del_test",
  weddingId: "wed_test",
  mediaId: "asset_test",
  objectPath: "weddings/wed_test/guest/file.jpg",
  thumbnailPath: null,
  status: "processing" as const,
  attempts: 1,
  lastError: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  processedAt: null,
  lastAttemptAt: "2026-07-12T00:00:00.000Z",
};

let deletedPaths: Array<string | null | undefined> = [];
let storageCleanupResults: boolean[] = [];
let deletionResults: boolean[] = [];
let recordedHealthDetails: Record<string, unknown> | null = null;

const expiredArchive = {
  id: "archive_aaaaaaaaaaaaaaaaaaaaaaaa",
  weddingId: "wedding_test",
  archivePath:
    "archives/wedding_test/archive_aaaaaaaaaaaaaaaaaaaaaaaa/mary-john-wedding-memories.zip",
};

function baseDependencies(): MaintenanceOverrides {
  return {
    listExpiredUploadReservations: async () => [],
    expireUploadReservation: async () => releasedReservation,
    listReleasedUploadReservations: async () => [],
    abortMultipartR2Upload: async () => undefined,
    isNoSuchMultipartUpload: () => false,
    deleteStoredFile: async (path) => {
      deletedPaths.push(path);
    },
    deleteArchiveJobPrefix: async (weddingId, jobId) => {
      deletedPaths.push(`archives/${weddingId}/${jobId}/`);
    },
    markUploadStorageCleanup: async (input) => {
      storageCleanupResults.push(input.success);
      return releasedReservation;
    },
    claimMediaDeletionJobs: async () => [],
    finishMediaDeletionJob: async (input) => {
      deletionResults.push(input.success);
    },
    listPendingCleanupWeddingIds: async () => [],
    finalizeOwnerCleanup: async () => undefined,
    claimExpiredArchiveJobs: async () => [],
    markArchiveStorageCleanup: async () => expiredArchive as never,
    checkSupabaseConnection: async () => 12,
    checkR2Connection: async () => 18,
    countCleanupCandidates: async () => 0,
    recordSystemHealth: async (input) => {
      recordedHealthDetails = input.details;
    },
  };
}

beforeEach(() => {
  deletedPaths = [];
  storageCleanupResults = [];
  deletionResults = [];
  recordedHealthDetails = null;
});

describe("daily maintenance", () => {
  test("releases stale quota and treats an already-gone multipart upload as clean", async () => {
    const noSuchUpload = Object.assign(new Error("gone"), {
      name: "NoSuchUpload",
    });
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      listExpiredUploadReservations: async () => [releasedReservation],
      listReleasedUploadReservations: async () => [releasedReservation],
      abortMultipartR2Upload: async () => {
        throw noSuchUpload;
      },
      isNoSuchMultipartUpload: (error) => error === noSuchUpload,
    });

    expect(result.expiredReservations).toBe(1);
    expect(result.cleanedReservations).toBe(1);
    expect(storageCleanupResults).toEqual([true]);
    expect(deletedPaths).toContain(releasedReservation.stagingObjectPath);
    expect(deletedPaths).toContain(releasedReservation.thumbnailStagingPath);
  });

  test("records a failed R2 deletion and does not finalize the wedding", async () => {
    let finalizeAttempts = 0;
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      claimMediaDeletionJobs: async () => [deletionJob],
      deleteStoredFile: async (path) => {
        if (path === deletionJob.objectPath) throw new Error("R2 unavailable");
      },
      listPendingCleanupWeddingIds: async () => [deletionJob.weddingId],
      finalizeOwnerCleanup: async () => {
        finalizeAttempts += 1;
        throw new Error("jobs incomplete");
      },
    });

    expect(result.failedDeletionJobs).toBe(1);
    expect(result.failedWeddingFinalizations).toBe(1);
    expect(result.finalizedWeddings).toBe(0);
    expect(deletionResults).toEqual([false]);
    expect(finalizeAttempts).toBe(1);
    expect(result.ok).toBe(false);
  });

  test("marks the run unhealthy when released reservation storage cleanup fails", async () => {
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      listReleasedUploadReservations: async () => [releasedReservation],
      abortMultipartR2Upload: async () => {
        throw new Error("R2 unavailable");
      },
    });

    expect(result.cleanedReservations).toBe(0);
    expect(result.failedReservationCleanups).toBe(1);
    expect(result.ok).toBe(false);
    expect(recordedHealthDetails).toMatchObject({
      failedReservationCleanups: 1,
    });
  });

  test("records a deletion-job claim failure instead of reporting a healthy run", async () => {
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      claimMediaDeletionJobs: async () => {
        throw new Error("claim failed");
      },
    });

    expect(result.failedDeletionJobClaims).toBe(1);
    expect(result.completedDeletionJobs).toBe(0);
    expect(result.ok).toBe(false);
    expect(recordedHealthDetails).toMatchObject({
      failedDeletionJobClaims: 1,
    });
  });

  test("counts a failed wedding finalization and keeps the run unhealthy", async () => {
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      listPendingCleanupWeddingIds: async () => ["wed_pending"],
      finalizeOwnerCleanup: async () => {
        throw new Error("jobs still pending");
      },
    });

    expect(result.finalizedWeddings).toBe(0);
    expect(result.failedWeddingFinalizations).toBe(1);
    expect(result.ok).toBe(false);
    expect(recordedHealthDetails).toMatchObject({
      failedWeddingFinalizations: 1,
    });
  });

  test("removes a ready archive after its 24-hour window ends", async () => {
    const archiveCleanupResults: boolean[] = [];
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      claimExpiredArchiveJobs: async () => [expiredArchive] as never,
      markArchiveStorageCleanup: async (input) => {
        archiveCleanupResults.push(input.success);
        return expiredArchive as never;
      },
    });

    expect(result.cleanedArchives).toBe(1);
    expect(result.failedArchiveCleanups).toBe(0);
    expect(deletedPaths).toContain(
      `archives/${expiredArchive.weddingId}/${expiredArchive.id}/`,
    );
    expect(archiveCleanupResults).toEqual([true]);
  });

  test("marks archive cleanup complete even when a failed job has no output object", async () => {
    const archiveCleanupResults: boolean[] = [];
    const failedArchive = { ...expiredArchive, archivePath: null };
    const result = await runDailyMaintenance({
      ...baseDependencies(),
      claimExpiredArchiveJobs: async () => [failedArchive] as never,
      markArchiveStorageCleanup: async (input) => {
        archiveCleanupResults.push(input.success);
        return failedArchive as never;
      },
    });

    expect(result.cleanedArchives).toBe(1);
    expect(deletedPaths).toEqual([
      `archives/${failedArchive.weddingId}/${failedArchive.id}/`,
    ]);
    expect(archiveCleanupResults).toEqual([true]);
  });
});
