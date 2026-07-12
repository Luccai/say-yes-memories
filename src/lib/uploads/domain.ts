import type { MediaKind } from "@/lib/types";

export const MAX_GUEST_UPLOAD_BYTES = 5 * 1024 ** 3;
export const SINGLE_UPLOAD_MAX_BYTES = 100 * 1024 ** 2;
export const MULTIPART_PART_BYTES = 64 * 1024 ** 2;
export const UPLOAD_RESERVATION_TTL_SECONDS = 24 * 60 * 60;
export const MAX_UPLOAD_PART_CONCURRENCY = 3;
export const MAX_THUMBNAIL_UPLOAD_BYTES = 1024 * 1024;

const MIME_KIND = new Map<string, MediaKind>([
  ["image/avif", "image"],
  ["image/gif", "image"],
  ["image/heic", "image"],
  ["image/heif", "image"],
  ["image/jpeg", "image"],
  ["image/png", "image"],
  ["image/webp", "image"],
  ["video/3gpp", "video"],
  ["video/mp4", "video"],
  ["video/mpeg", "video"],
  ["video/quicktime", "video"],
  ["video/webm", "video"],
  ["video/x-m4v", "video"],
  ["audio/aac", "audio"],
  ["audio/flac", "audio"],
  ["audio/m4a", "audio"],
  ["audio/mp3", "audio"],
  ["audio/mp4", "audio"],
  ["audio/mpeg", "audio"],
  ["audio/ogg", "audio"],
  ["audio/opus", "audio"],
  ["audio/wav", "audio"],
  ["audio/webm", "audio"],
  ["audio/x-m4a", "audio"],
  ["audio/x-wav", "audio"],
]);

const THUMBNAIL_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Upload request is invalid.");
  }
  return value as Record<string, unknown>;
}

function textField(record: Record<string, unknown>, key: string) {
  return typeof record[key] === "string" ? record[key] : "";
}

function normalizeSpaces(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeUploadMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

export function supportedMediaKind(mimeType: string) {
  return MIME_KIND.get(normalizeUploadMimeType(mimeType)) ?? null;
}

function validateFileName(value: string) {
  const fileName = value.trim();
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName)) {
    throw new Error("File name is invalid.");
  }
  return fileName;
}

function validateByteSize(value: unknown, maximum = MAX_GUEST_UPLOAD_BYTES) {
  const byteSize = Number(value);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error("The selected file is empty.");
  }
  if (byteSize > maximum) {
    throw new Error(
      maximum === MAX_GUEST_UPLOAD_BYTES
        ? "Files can be up to 5 GiB."
        : "The preview image is too large.",
    );
  }
  return byteSize;
}

export function planGuestUpload(byteSize: number) {
  const validByteSize = validateByteSize(byteSize);
  if (validByteSize <= SINGLE_UPLOAD_MAX_BYTES) {
    return {
      mode: "single" as const,
      partCount: 1,
      partSizeBytes: validByteSize,
    };
  }
  return {
    mode: "multipart" as const,
    partCount: Math.ceil(validByteSize / MULTIPART_PART_BYTES),
    partSizeBytes: MULTIPART_PART_BYTES,
  };
}

export function expectedPartByteSize(
  totalByteSize: number,
  partCount: number,
  partNumber: number,
) {
  const plan = planGuestUpload(totalByteSize);
  if (
    plan.mode !== "multipart" ||
    partCount !== plan.partCount ||
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > partCount
  ) {
    throw new Error("Upload part is invalid.");
  }
  return partNumber === partCount
    ? totalByteSize - MULTIPART_PART_BYTES * (partCount - 1)
    : MULTIPART_PART_BYTES;
}

export function validateGuestUploadInput(value: unknown) {
  const record = asRecord(value);
  const requestKey = textField(record, "requestKey").trim();
  const reservationSecret = textField(record, "reservationSecret").trim();
  const turnstileToken = textField(record, "turnstileToken").trim();
  const guestName = normalizeSpaces(textField(record, "guestName"));
  const note = textField(record, "note").trim();
  const fileName = validateFileName(textField(record, "fileName"));
  const mimeType = normalizeUploadMimeType(textField(record, "mimeType"));
  const kind = supportedMediaKind(mimeType);
  const byteSize = validateByteSize(record.byteSize);

  if (!/^[A-Za-z0-9:_-]{20,160}$/.test(requestKey)) {
    throw new Error("Upload request key is invalid.");
  }
  if (!/^sy_upload_[A-Za-z0-9_-]{43}$/.test(reservationSecret)) {
    throw new Error("Upload secret is invalid.");
  }
  if (!turnstileToken || turnstileToken.length > 4096) {
    throw new Error("Upload verification is required.");
  }
  if (!guestName || guestName.length > 120) {
    throw new Error("Your name is required.");
  }
  if (note.length > 2000) {
    throw new Error("The memory note is too long.");
  }
  if (!kind) {
    throw new Error("Only supported photo, video, or audio files are accepted.");
  }

  let thumbnail:
    | { fileName: string; mimeType: string; byteSize: number }
    | undefined;
  if (record.thumbnail !== undefined) {
    const thumbnailRecord = asRecord(record.thumbnail);
    const thumbnailMimeType = normalizeUploadMimeType(
      textField(thumbnailRecord, "mimeType"),
    );
    if (!THUMBNAIL_MIME_TYPES.has(thumbnailMimeType)) {
      throw new Error("The preview image type is not supported.");
    }
    thumbnail = {
      fileName: validateFileName(textField(thumbnailRecord, "fileName")),
      mimeType: thumbnailMimeType,
      byteSize: validateByteSize(
        thumbnailRecord.byteSize,
        MAX_THUMBNAIL_UPLOAD_BYTES,
      ),
    };
  }

  return {
    requestKey,
    reservationSecret,
    turnstileToken,
    guestName,
    note: note || undefined,
    file: { fileName, mimeType, byteSize, kind },
    thumbnail,
    plan: planGuestUpload(byteSize),
  };
}
