import { resolveWeddingRecordBySlug } from "@/lib/supabase-store";
import { verifyTurnstile } from "@/lib/security/turnstile";
import {
  abortMultipartR2Upload,
  createMultipartR2Upload,
  createReservationSignedTarget,
  deleteStoredFile,
} from "@/lib/storage/storage-service";
import { validateGuestUploadInput } from "@/lib/uploads/domain";
import {
  classifyUploadError,
  publicReservationState,
  uploadError,
  uploadJson,
} from "@/lib/uploads/http";
import {
  buildUploadObjectPaths,
  deriveUploadIdentity,
  hashUploadRequestKey,
  hashUploadSecret,
} from "@/lib/uploads/security";
import {
  abortUploadReservation,
  attachMultipartUpload,
  getUploadReservation,
  reserveGuestUpload,
} from "@/lib/uploads/store";

const defaultDependencies = {
  verifyTurnstile,
  resolveWeddingRecordBySlug,
  reserveGuestUpload,
  getUploadReservation,
  attachMultipartUpload,
  abortUploadReservation,
  createMultipartR2Upload,
  abortMultipartR2Upload,
  createReservationSignedTarget,
  deleteStoredFile,
};

type Dependencies = typeof defaultDependencies;

async function releaseFailedReservation(input: {
  reservationId: string;
  secretHash: string;
  stagingObjectPath: string;
  thumbnailStagingPath: string | null;
  uploadId?: string;
}, dependencies: Dependencies) {
  if (input.uploadId) {
    await dependencies.abortMultipartR2Upload({
      storagePath: input.stagingObjectPath,
      uploadId: input.uploadId,
    }).catch(() => undefined);
  }
  await Promise.all([
    dependencies.deleteStoredFile(input.stagingObjectPath).catch(() => undefined),
    dependencies.deleteStoredFile(input.thumbnailStagingPath).catch(() => undefined),
  ]);
  await dependencies.abortUploadReservation({
    reservationId: input.reservationId,
    secretHash: input.secretHash,
    now: new Date().toISOString(),
  }).catch(() => undefined);
}

export function createReservationPost(
  dependencies: Dependencies = defaultDependencies,
) {
  return async function reservationPost(
    request: Request,
    context: { params: Promise<{ slug: string }> },
  ) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return uploadError("INVALID_UPLOAD_REQUEST", 400);
  }

  try {
    const input = validateGuestUploadInput(rawBody);
    await dependencies.verifyTurnstile({ token: input.turnstileToken, request });

    const { slug } = await context.params;
    const resolved = await dependencies.resolveWeddingRecordBySlug(slug);
    if (!resolved) return uploadError("WEDDING_NOT_FOUND", 404);

    const identity = deriveUploadIdentity(input.requestKey);
    const paths = buildUploadObjectPaths({
      weddingId: resolved.wedding.id,
      reservationId: identity.reservationId,
      mediaId: identity.mediaId,
      fileName: input.file.fileName,
      thumbnailFileName: input.thumbnail?.fileName,
    });
    const secretHash = hashUploadSecret(input.reservationSecret);
    let reservation = await dependencies.reserveGuestUpload({
      id: identity.reservationId,
      clientRequestKeyHash: hashUploadRequestKey(input.requestKey),
      secretHash,
      mediaId: identity.mediaId,
      weddingId: resolved.wedding.id,
      mode: input.plan.mode,
      objectPath: paths.objectPath,
      stagingObjectPath: paths.stagingObjectPath,
      kind: input.file.kind,
      mimeType: input.file.mimeType,
      fileName: input.file.fileName,
      byteSize: input.file.byteSize,
      partSizeBytes: input.plan.partSizeBytes,
      partCount: input.plan.partCount,
      thumbnailPath: paths.thumbnailPath,
      thumbnailStagingPath: paths.thumbnailStagingPath,
      thumbnailMimeType: input.thumbnail?.mimeType,
      thumbnailFileName: input.thumbnail?.fileName,
      thumbnailByteSize: input.thumbnail?.byteSize,
      guestName: input.guestName,
      note: input.note,
      now: new Date().toISOString(),
    });

    if (reservation.status === "completed") {
      return uploadJson({
        reservation: publicReservationState(reservation),
        canonicalSlug: resolved.canonicalSlug,
      });
    }
    if (reservation.status === "aborted" || reservation.status === "expired") {
      return uploadError("UPLOAD_RESTART_REQUIRED", 409);
    }

    if (reservation.mode === "multipart" && !reservation.r2UploadId) {
      let createdUploadId: string | undefined;
      try {
        createdUploadId = await dependencies.createMultipartR2Upload({
          storagePath: reservation.stagingObjectPath,
          mimeType: reservation.mimeType,
        });
        try {
          reservation = await dependencies.attachMultipartUpload({
            reservationId: reservation.id,
            secretHash,
            uploadId: createdUploadId,
            now: new Date().toISOString(),
          });
        } catch (error) {
          const current = await dependencies.getUploadReservation(
            reservation.id,
            secretHash,
          );
          if (!current?.r2UploadId) throw error;
          await dependencies.abortMultipartR2Upload({
            storagePath: reservation.stagingObjectPath,
            uploadId: createdUploadId,
          }).catch(() => undefined);
          createdUploadId = undefined;
          reservation = current;
        }
      } catch (error) {
        await releaseFailedReservation(
          {
            reservationId: reservation.id,
            secretHash,
            stagingObjectPath: reservation.stagingObjectPath,
            thumbnailStagingPath: reservation.thumbnailStagingPath,
            uploadId: createdUploadId,
          },
          dependencies,
        );
        throw error;
      }
    }

    const upload =
      reservation.mode === "single"
        ? await dependencies.createReservationSignedTarget({
            storagePath: reservation.stagingObjectPath,
            mimeType: reservation.mimeType,
            byteSize: reservation.byteSize,
          })
        : undefined;
    const thumbnailUpload =
      reservation.thumbnailStagingPath &&
      reservation.thumbnailMimeType &&
      reservation.thumbnailByteSize
        ? await dependencies
            .createReservationSignedTarget({
              storagePath: reservation.thumbnailStagingPath,
              mimeType: reservation.thumbnailMimeType,
              byteSize: reservation.thumbnailByteSize,
              maxBytes: 1024 * 1024,
              allowedKinds: ["image"],
            })
            .catch(() => undefined)
        : undefined;

    return uploadJson({
      reservation: publicReservationState(reservation),
      canonicalSlug: resolved.canonicalSlug,
      upload,
      thumbnailUpload,
    });
  } catch (error) {
    return classifyUploadError(error);
  }
  };
}

export const POST = createReservationPost();
