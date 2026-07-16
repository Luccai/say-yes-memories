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

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/avif": ["avif"],
  "image/gif": ["gif"],
  "image/heic": ["heic"],
  "image/heif": ["heif", "heic"],
  "image/jpeg": ["jpg", "jpeg", "jpe"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "video/3gpp": ["3gp", "3gpp"],
  "video/mp4": ["mp4"],
  "video/mpeg": ["mpeg", "mpg", "mpe"],
  "video/quicktime": ["mov", "qt"],
  "video/webm": ["webm"],
  "video/x-m4v": ["m4v"],
  "audio/aac": ["aac"],
  "audio/flac": ["flac"],
  "audio/m4a": ["m4a"],
  "audio/mp3": ["mp3"],
  "audio/mp4": ["m4a", "mp4"],
  "audio/mpeg": ["mp3", "mpeg", "mpga"],
  "audio/ogg": ["ogg", "oga"],
  "audio/opus": ["opus", "ogg"],
  "audio/wav": ["wav"],
  "audio/webm": ["webm", "weba"],
  "audio/x-m4a": ["m4a"],
  "audio/x-wav": ["wav"],
};

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

export function validateMediaFileName(value: string, mimeType?: string) {
  const fileName = value.trim();
  if (!fileName || fileName.length > 255 || /[\u0000-\u001f\u007f]/.test(fileName)) {
    throw new Error("File name is invalid.");
  }
  const extension = fileName.match(/\.([a-z0-9]{1,12})$/i)?.[1]?.toLowerCase();
  const allowedExtensions = mimeType
    ? MIME_EXTENSIONS[normalizeUploadMimeType(mimeType)]
    : undefined;
  if (extension && allowedExtensions && !allowedExtensions.includes(extension)) {
    throw new Error("The file extension does not match its media type.");
  }
  return fileName;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0) {
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

export function mediaSignatureMatches(bytes: Uint8Array, rawMimeType: string) {
  const mimeType = normalizeUploadMimeType(rawMimeType);
  if (mimeType === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === "image/png") {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === "image/gif") {
    const header = ascii(bytes, 0, 6);
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mimeType === "image/webp") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }
  if (["image/avif", "image/heic", "image/heif"].includes(mimeType)) {
    if (ascii(bytes, 4, 8) !== "ftyp") return false;
    const brands = ascii(bytes, 8, Math.min(bytes.length, 32));
    const expected =
      mimeType === "image/avif"
        ? ["avif", "avis"]
        : ["heic", "heix", "hevc", "hevx", "mif1", "msf1"];
    return expected.some((brand) => brands.includes(brand));
  }
  if (["video/mp4", "video/quicktime", "video/x-m4v", "video/3gpp", "audio/m4a", "audio/mp4", "audio/x-m4a"].includes(mimeType)) {
    return ascii(bytes, 4, 8) === "ftyp";
  }
  if (mimeType === "video/mpeg") {
    return startsWith(bytes, [0x00, 0x00, 0x01, 0xba]) || startsWith(bytes, [0x00, 0x00, 0x01, 0xb3]);
  }
  if (mimeType === "video/webm" || mimeType === "audio/webm") {
    return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (mimeType === "audio/aac") {
    return bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xf6) === 0xf0;
  }
  if (mimeType === "audio/flac") return ascii(bytes, 0, 4) === "fLaC";
  if (["audio/mp3", "audio/mpeg"].includes(mimeType)) {
    return ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && bytes[1] !== undefined && (bytes[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "audio/ogg" || mimeType === "audio/opus") {
    return ascii(bytes, 0, 4) === "OggS";
  }
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE";
  }
  return false;
}

export function safeDownloadFileName(fileName: string, mimeType: string) {
  const allowed = MIME_EXTENSIONS[normalizeUploadMimeType(mimeType)];
  const extension = allowed?.[0] ?? "bin";
  const leaf = fileName.split(/[\\/]/).pop()?.trim() || "memory";
  const base = leaf
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 _-]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "memory";
  return `${base}.${extension}`;
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
  const mimeType = normalizeUploadMimeType(textField(record, "mimeType"));
  const fileName = validateMediaFileName(textField(record, "fileName"), mimeType);
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
      fileName: validateMediaFileName(
        textField(thumbnailRecord, "fileName"),
        thumbnailMimeType,
      ),
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
