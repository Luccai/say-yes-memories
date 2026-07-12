import { NextResponse } from "next/server";
import { hashUploadSecret } from "@/lib/uploads/security";

const RESERVATION_ID = /^upload_[a-f0-9]{24}$/;
const RESERVATION_SECRET = /^sy_upload_[A-Za-z0-9_-]{43}$/;

export function uploadJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export function uploadError(code: string, status: number) {
  return uploadJson({ code, message: code }, { status });
}

export function classifyUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Storage quota")) {
    return uploadError("STORAGE_QUOTA_FULL", 409);
  }
  if (
    message.includes("Guest uploads are unavailable") ||
    message.includes("Wedding membership is unavailable")
  ) {
    return uploadError("UPLOADS_UNAVAILABLE", 403);
  }
  if (message.includes("verification")) {
    return uploadError("UPLOAD_VERIFICATION_FAILED", 403);
  }
  if (message.includes("expired") || message.includes("has expired")) {
    return uploadError("UPLOAD_EXPIRED", 410);
  }
  if (
    message.includes("was not found") ||
    message.includes("reservation is unavailable") ||
    message.includes("part is unavailable")
  ) {
    return uploadError("UPLOAD_NOT_FOUND", 404);
  }
  if (message.includes("reused with different metadata")) {
    return uploadError("UPLOAD_REQUEST_CONFLICT", 409);
  }
  return uploadError("UPLOAD_FAILED", 400);
}

export function parseReservationId(value: string) {
  if (!RESERVATION_ID.test(value)) {
    throw new Error("Upload reservation was not found.");
  }
  return value;
}

export function reservationCredentials(request: Request, reservationId: string) {
  parseReservationId(reservationId);
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match || !RESERVATION_SECRET.test(match[1])) {
    throw new Error("Upload reservation was not found.");
  }
  return {
    reservationId,
    secretHash: hashUploadSecret(match[1]),
  };
}

export function publicReservationState(input: {
  id: string;
  mode: "single" | "multipart";
  status: "pending" | "uploading" | "completed" | "aborted" | "expired";
  mediaId: string;
  byteSize: number;
  partSizeBytes: number;
  partCount: number;
  expiresAt: string;
  thumbnailByteSize: number | null;
  completedAt: string | null;
}) {
  return {
    id: input.id,
    mode: input.mode,
    status: input.status,
    mediaId: input.mediaId,
    byteSize: input.byteSize,
    partSizeBytes: input.partSizeBytes,
    partCount: input.partCount,
    expiresAt: input.expiresAt,
    hasThumbnail: input.thumbnailByteSize !== null,
    completedAt: input.completedAt,
  };
}
