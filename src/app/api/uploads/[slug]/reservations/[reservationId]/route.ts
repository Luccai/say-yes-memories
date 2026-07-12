import {
  abortMultipartR2Upload,
  deleteStoredFile,
} from "@/lib/storage/storage-service";
import {
  classifyUploadError,
  publicReservationState,
  reservationCredentials,
  uploadError,
  uploadJson,
} from "@/lib/uploads/http";
import {
  abortUploadReservation,
  listUploadParts,
} from "@/lib/uploads/store";

type Context = {
  params: Promise<{ slug: string; reservationId: string }>;
};

export async function GET(request: Request, context: Context) {
  try {
    const { reservationId } = await context.params;
    const credentials = reservationCredentials(request, reservationId);
    const state = await listUploadParts(
      credentials.reservationId,
      credentials.secretHash,
    );
    if (!state) return uploadError("UPLOAD_NOT_FOUND", 404);
    return uploadJson({
      reservation: publicReservationState(state.reservation),
      uploadedParts: state.parts.map((part) => ({
        partNumber: part.partNumber,
        byteSize: part.byteSize,
      })),
    });
  } catch (error) {
    return classifyUploadError(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { reservationId } = await context.params;
    const credentials = reservationCredentials(request, reservationId);
    const state = await listUploadParts(
      credentials.reservationId,
      credentials.secretHash,
    );
    if (!state) return uploadError("UPLOAD_NOT_FOUND", 404);
    if (state.reservation.status === "completed") {
      return uploadError("COMPLETED_UPLOAD_CANNOT_BE_CANCELLED", 409);
    }

    if (state.reservation.r2UploadId) {
      await abortMultipartR2Upload({
        storagePath: state.reservation.stagingObjectPath,
        uploadId: state.reservation.r2UploadId,
      }).catch(() => undefined);
    }
    await Promise.all([
      deleteStoredFile(state.reservation.stagingObjectPath).catch(() => undefined),
      deleteStoredFile(state.reservation.thumbnailStagingPath).catch(() => undefined),
    ]);
    const reservation = await abortUploadReservation({
      ...credentials,
      now: new Date().toISOString(),
    });
    return uploadJson({ reservation: publicReservationState(reservation) });
  } catch (error) {
    return classifyUploadError(error);
  }
}
