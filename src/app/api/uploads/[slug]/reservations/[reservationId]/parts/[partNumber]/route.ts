import { createSignedMultipartPart } from "@/lib/storage/storage-service";
import { expectedPartByteSize } from "@/lib/uploads/domain";
import {
  classifyUploadError,
  reservationCredentials,
  uploadError,
  uploadJson,
} from "@/lib/uploads/http";
import { listUploadParts } from "@/lib/uploads/store";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      slug: string;
      reservationId: string;
      partNumber: string;
    }>;
  },
) {
  try {
    const { reservationId, partNumber: rawPartNumber } = await context.params;
    const credentials = reservationCredentials(request, reservationId);
    const state = await listUploadParts(reservationId, credentials.secretHash);
    if (!state) return uploadError("UPLOAD_NOT_FOUND", 404);
    const partNumber = Number(rawPartNumber);
    const expectedByteSize = expectedPartByteSize(
      state.reservation.byteSize,
      state.reservation.partCount,
      partNumber,
    );
    if (
      state.reservation.mode !== "multipart" ||
      state.reservation.status !== "uploading" ||
      !state.reservation.r2UploadId ||
      Date.parse(state.reservation.expiresAt) <= Date.now()
    ) {
      return uploadError("UPLOAD_NOT_FOUND", 404);
    }

    const recorded = state.parts.find((part) => part.partNumber === partNumber);
    if (recorded) {
      return uploadJson({
        partNumber,
        expectedByteSize,
        alreadyUploaded: true,
      });
    }
    const upload = await createSignedMultipartPart({
      storagePath: state.reservation.stagingObjectPath,
      uploadId: state.reservation.r2UploadId,
      partNumber,
    });
    return uploadJson({ partNumber, expectedByteSize, upload });
  } catch (error) {
    return classifyUploadError(error);
  }
}
