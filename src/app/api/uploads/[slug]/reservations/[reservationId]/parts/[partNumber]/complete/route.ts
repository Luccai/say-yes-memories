import { expectedPartByteSize } from "@/lib/uploads/domain";
import {
  classifyUploadError,
  reservationCredentials,
  uploadError,
  uploadJson,
} from "@/lib/uploads/http";
import { getUploadReservation, recordUploadPart } from "@/lib/uploads/store";

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
    const reservation = await getUploadReservation(
      reservationId,
      credentials.secretHash,
    );
    if (!reservation) return uploadError("UPLOAD_NOT_FOUND", 404);
    const partNumber = Number(rawPartNumber);
    const expectedByteSize = expectedPartByteSize(
      reservation.byteSize,
      reservation.partCount,
      partNumber,
    );

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return uploadError("INVALID_UPLOAD_PART", 400);
    }
    const record = body as { etag?: unknown; byteSize?: unknown };
    const etag = typeof record.etag === "string" ? record.etag.trim() : "";
    const byteSize = Number(record.byteSize);
    if (
      !etag ||
      etag.length > 256 ||
      /[\u0000-\u001f\u007f]/.test(etag) ||
      byteSize !== expectedByteSize
    ) {
      return uploadError("INVALID_UPLOAD_PART", 400);
    }

    const part = await recordUploadPart({
      ...credentials,
      partNumber,
      etag,
      byteSize,
      now: new Date().toISOString(),
    });
    return uploadJson({
      partNumber: part.partNumber,
      byteSize: part.byteSize,
      uploaded: true,
    });
  } catch (error) {
    return classifyUploadError(error);
  }
}
