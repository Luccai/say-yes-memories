import {
  checkR2Connection,
  deleteStoredFile,
  deleteArchiveJobPrefix,
  abortMultipartR2Upload,
  isNoSuchMultipartUpload,
  listStaleProfileStagingObjects,
} from "@/lib/storage/storage-service";
import {
  expireUploadReservation,
  listExpiredUploadReservations,
  listReleasedUploadReservations,
  markUploadStorageCleanup,
} from "@/lib/uploads/store";
import {
  checkSupabaseConnection,
  claimMediaDeletionJobs,
  countCleanupCandidates,
  finalizeOwnerCleanup,
  finishMediaDeletionJob,
  listPendingCleanupWeddingIds,
  recordSystemHealth,
  pruneOperationalMetadata,
} from "@/lib/maintenance/store";
import {
  claimExpiredArchiveJobs,
  markArchiveStorageCleanup,
} from "@/lib/archives/store";

const defaultDependencies = {
  checkR2Connection,
  deleteStoredFile,
  deleteArchiveJobPrefix,
  abortMultipartR2Upload,
  isNoSuchMultipartUpload,
  listStaleProfileStagingObjects,
  expireUploadReservation,
  listExpiredUploadReservations,
  listReleasedUploadReservations,
  markUploadStorageCleanup,
  checkSupabaseConnection,
  claimMediaDeletionJobs,
  countCleanupCandidates,
  finalizeOwnerCleanup,
  finishMediaDeletionJob,
  listPendingCleanupWeddingIds,
  recordSystemHealth,
  pruneOperationalMetadata,
  claimExpiredArchiveJobs,
  markArchiveStorageCleanup,
};

type Dependencies = typeof defaultDependencies;

function errorText(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Unknown error";
}

async function cleanReleasedReservation(
  reservation: Awaited<
    ReturnType<Dependencies["listReleasedUploadReservations"]>
  >[number],
  dependencies: Dependencies,
  now: string,
) {
  try {
    if (reservation.r2UploadId) {
      try {
        await dependencies.abortMultipartR2Upload({
          storagePath: reservation.stagingObjectPath,
          uploadId: reservation.r2UploadId,
        });
      } catch (error) {
        if (!dependencies.isNoSuchMultipartUpload(error)) throw error;
      }
    }
    await Promise.all([
      dependencies.deleteStoredFile(reservation.stagingObjectPath),
      dependencies.deleteStoredFile(reservation.thumbnailStagingPath),
    ]);
    await dependencies.markUploadStorageCleanup({
      reservationId: reservation.id,
      success: true,
      now,
    });
    return true;
  } catch (error) {
    await dependencies
      .markUploadStorageCleanup({
        reservationId: reservation.id,
        success: false,
        error: errorText(error),
        now,
      })
      .catch(() => undefined);
    return false;
  }
}

export async function runDailyMaintenance(
  dependencyOverrides: Partial<Dependencies> = {},
) {
  const dependencies: Dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  };
  const now = new Date().toISOString();
  const result = {
    expiredReservations: 0,
    cleanedReservations: 0,
    failedReservationCleanups: 0,
    failedDeletionJobClaims: 0,
    completedDeletionJobs: 0,
    failedDeletionJobs: 0,
    finalizedWeddings: 0,
    failedWeddingFinalizations: 0,
    cleanedArchives: 0,
    failedArchiveCleanups: 0,
    cleanedProfileStagingObjects: 0,
    failedProfileStagingCleanups: 0,
    prunedUploadReservations: 0,
    prunedDeletionJobs: 0,
    prunedRateLimitBuckets: 0,
    failedMetadataPrunes: 0,
  };

  const expired = await dependencies.listExpiredUploadReservations(now, 200);
  for (const reservation of expired) {
    try {
      await dependencies.expireUploadReservation({
        reservationId: reservation.id,
        now,
      });
      result.expiredReservations += 1;
    } catch {
      // Another invocation may have already released the same reservation.
    }
  }

  const released = await dependencies.listReleasedUploadReservations(now, 200);
  for (const reservation of released) {
    if (await cleanReleasedReservation(reservation, dependencies, now)) {
      result.cleanedReservations += 1;
    } else {
      result.failedReservationCleanups += 1;
    }
  }

  const staleProfileObjects = await dependencies
    .listStaleProfileStagingObjects(
      new Date(Date.parse(now) - 10 * 60 * 1000),
      200,
    )
    .catch(() => {
      result.failedProfileStagingCleanups += 1;
      return [];
    });
  for (const storagePath of staleProfileObjects) {
    try {
      await dependencies.deleteStoredFile(storagePath);
      result.cleanedProfileStagingObjects += 1;
    } catch {
      result.failedProfileStagingCleanups += 1;
    }
  }

  let deletionJobs: Awaited<ReturnType<Dependencies["claimMediaDeletionJobs"]>> = [];
  try {
    deletionJobs = await dependencies.claimMediaDeletionJobs(now, 100);
  } catch {
    result.failedDeletionJobClaims += 1;
  }
  for (const job of deletionJobs) {
    try {
      await Promise.all([
        dependencies.deleteStoredFile(job.objectPath),
        dependencies.deleteStoredFile(job.thumbnailPath),
      ]);
      await dependencies.finishMediaDeletionJob({
        jobId: job.id,
        success: true,
        now,
      });
      result.completedDeletionJobs += 1;
    } catch (error) {
      await dependencies
        .finishMediaDeletionJob({
          jobId: job.id,
          success: false,
          error: errorText(error),
          now,
        })
        .catch(() => undefined);
      result.failedDeletionJobs += 1;
    }
  }

  for (const weddingId of await dependencies.listPendingCleanupWeddingIds(200)) {
    try {
      await dependencies.finalizeOwnerCleanup(weddingId, now);
      result.finalizedWeddings += 1;
    } catch {
      result.failedWeddingFinalizations += 1;
    }
  }

  let expiredArchives: Awaited<
    ReturnType<Dependencies["claimExpiredArchiveJobs"]>
  > = [];
  try {
    expiredArchives = await dependencies.claimExpiredArchiveJobs(now, 100);
  } catch {
    result.failedArchiveCleanups += 1;
  }

  for (const archive of expiredArchives) {
    try {
      await dependencies.deleteArchiveJobPrefix(archive.weddingId, archive.id);
      await dependencies.markArchiveStorageCleanup({
        jobId: archive.id,
        success: true,
        now,
      });
      result.cleanedArchives += 1;
    } catch (error) {
      await dependencies
        .markArchiveStorageCleanup({
          jobId: archive.id,
          success: false,
          error: errorText(error),
          now,
        })
        .catch(() => undefined);
      result.failedArchiveCleanups += 1;
    }
  }

  try {
    const pruned = await dependencies.pruneOperationalMetadata(now, 500);
    result.prunedUploadReservations = pruned.uploadReservationsDeleted;
    result.prunedDeletionJobs = pruned.deletionJobsDeleted;
    result.prunedRateLimitBuckets = pruned.rateLimitBucketsDeleted;
  } catch {
    result.failedMetadataPrunes += 1;
  }

  let supabaseLatencyMs: number | undefined;
  let r2LatencyMs: number | undefined;
  let supabaseOk = false;
  let r2Ok = false;
  try {
    supabaseLatencyMs = await dependencies.checkSupabaseConnection();
    supabaseOk = true;
  } catch {
    supabaseOk = false;
  }
  try {
    r2LatencyMs = await dependencies.checkR2Connection();
    r2Ok = true;
  } catch {
    r2Ok = false;
  }
  const cleanupCandidateCount = await dependencies
    .countCleanupCandidates(now)
    .catch(() => 0);
  await dependencies.recordSystemHealth({
    supabaseOk,
    r2Ok,
    supabaseLatencyMs,
    r2LatencyMs,
    cleanupCandidateCount,
    details: result,
    checkedAt: now,
  });

  return {
    ok:
      supabaseOk &&
      r2Ok &&
      result.failedReservationCleanups === 0 &&
      result.failedDeletionJobClaims === 0 &&
      result.failedDeletionJobs === 0 &&
      result.failedWeddingFinalizations === 0 &&
      result.failedArchiveCleanups === 0 &&
      result.failedProfileStagingCleanups === 0 &&
      result.failedMetadataPrunes === 0,
    ...result,
    supabaseOk,
    r2Ok,
    cleanupCandidateCount,
  };
}
