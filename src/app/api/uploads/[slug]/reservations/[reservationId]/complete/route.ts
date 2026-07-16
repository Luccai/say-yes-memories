import { resolveWeddingRecordBySlug } from "@/lib/supabase-store";
import { broadcastWeddingMediaChange } from "@/lib/supabase/realtime";
import {
  completeMultipartR2Upload,
  assertStoredMediaSignature,
  deleteStoredFile,
  headR2Object,
  promoteStagedObject,
} from "@/lib/storage/storage-service";
import {
  classifyUploadError,
  publicReservationState,
  reservationCredentials,
  uploadError,
  uploadJson,
} from "@/lib/uploads/http";
import {
  completeUploadReservation,
  listUploadParts,
} from "@/lib/uploads/store";

const defaultDependencies = {
  resolveWeddingRecordBySlug,
  broadcastWeddingMediaChange,
  completeMultipartR2Upload,
  assertStoredMediaSignature,
  deleteStoredFile,
  headR2Object,
  promoteStagedObject,
  completeUploadReservation,
  listUploadParts,
};

type Dependencies = typeof defaultDependencies;

export function createReservationCompletePost(
  dependencies: Dependencies = defaultDependencies,
) {
  return async function reservationCompletePost(
    request: Request,
    context: { params: Promise<{ slug: string; reservationId: string }> },
  ) {
  try {
    const { slug, reservationId } = await context.params;
    const credentials = reservationCredentials(request, reservationId);
    const state = await dependencies.listUploadParts(
      reservationId,
      credentials.secretHash,
    );
    if (!state) return uploadError("UPLOAD_NOT_FOUND", 404);
    const reservation = state.reservation;

    if (reservation.status === "aborted" || reservation.status === "expired") {
      return uploadError("UPLOAD_EXPIRED", 410);
    }
    if (reservation.status !== "completed") {
      if (Date.parse(reservation.expiresAt) <= Date.now()) {
        return uploadError("UPLOAD_EXPIRED", 410);
      }
      if (reservation.mode === "multipart") {
        if (!reservation.r2UploadId || state.parts.length !== reservation.partCount) {
          return uploadError("UPLOAD_INCOMPLETE", 409);
        }
        const finalObject = await dependencies.headR2Object(
          reservation.objectPath,
        );
        if (!finalObject.exists) {
          const staged = await dependencies.headR2Object(
            reservation.stagingObjectPath,
          );
          if (!staged.exists) {
          try {
            await dependencies.completeMultipartR2Upload({
              storagePath: reservation.stagingObjectPath,
              uploadId: reservation.r2UploadId,
              parts: state.parts.map((part) => ({
                partNumber: part.partNumber,
                etag: part.etag,
              })),
            });
          } catch (error) {
            const completedByAnotherRequest = await dependencies.headR2Object(
              reservation.stagingObjectPath,
            );
            if (!completedByAnotherRequest.exists) throw error;
          }
          }
        }
      }

      await dependencies.assertStoredMediaSignature(
        reservation.stagingObjectPath,
        reservation.mimeType,
      );
      await dependencies.promoteStagedObject({
        stagingPath: reservation.stagingObjectPath,
        finalPath: reservation.objectPath,
        expectedByteSize: reservation.byteSize,
        mimeType: reservation.mimeType,
      });
    }

    let thumbnailCompleted = reservation.thumbnailCompletedAt !== null;
    if (
      !thumbnailCompleted &&
      reservation.thumbnailStagingPath &&
      reservation.thumbnailPath &&
      reservation.thumbnailByteSize &&
      reservation.thumbnailMimeType
    ) {
      try {
        const thumbnail = await dependencies.headR2Object(
          reservation.thumbnailStagingPath,
        );
        if (thumbnail.exists && thumbnail.byteSize === reservation.thumbnailByteSize) {
          await dependencies.assertStoredMediaSignature(
            reservation.thumbnailStagingPath,
            reservation.thumbnailMimeType,
          );
          await dependencies.promoteStagedObject({
            stagingPath: reservation.thumbnailStagingPath,
            finalPath: reservation.thumbnailPath,
            expectedByteSize: reservation.thumbnailByteSize,
            mimeType: reservation.thumbnailMimeType,
          });
          thumbnailCompleted = true;
        } else if (thumbnail.exists) {
          await dependencies.deleteStoredFile(reservation.thumbnailStagingPath);
        }
      } catch (error) {
        console.warn("Optional upload thumbnail could not be finalized.", error);
      }
    }

    const media = await dependencies.completeUploadReservation({
      ...credentials,
      thumbnailCompleted,
      now: new Date().toISOString(),
    });
    const resolved = await dependencies.resolveWeddingRecordBySlug(slug);
    if (resolved?.wedding.id === reservation.weddingId) {
      await dependencies
        .broadcastWeddingMediaChange(resolved.wedding.realtimeTopic)
        .catch(() => undefined);
    }
    return uploadJson({
      reservation: publicReservationState({
        ...reservation,
        status: "completed",
        completedAt:
          typeof media.created_at === "string"
            ? media.created_at
            : reservation.completedAt,
      }),
      media: { id: reservation.mediaId },
    });
  } catch (error) {
    return classifyUploadError(error);
  }
  };
}

export const POST = createReservationCompletePost();
