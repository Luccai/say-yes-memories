import { createHash } from "node:crypto";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashUploadRequestKey(requestKey: string) {
  return sha256(`upload-request\0${requestKey}`);
}

export function hashUploadSecret(secret: string) {
  return sha256(`upload-secret\0${secret}`);
}

export function deriveUploadIdentity(requestKey: string) {
  return {
    reservationId: `upload_${sha256(`reservation\0${requestKey}`).slice(0, 24)}`,
    mediaId: `asset_${sha256(`media\0${requestKey}`).slice(0, 24)}`,
  };
}

export function sanitizeStorageFileName(fileName: string) {
  const name = fileName.trim() || "upload";
  const parts = name.split(".");
  const rawExtension = parts.length > 1 ? parts.pop() ?? "" : "";
  const extension = rawExtension
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
  const base = parts
    .join(".")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "memory";
  return extension ? `${base}.${extension}` : base;
}

export function buildUploadObjectPaths(input: {
  weddingId: string;
  reservationId: string;
  mediaId: string;
  fileName: string;
  thumbnailFileName?: string;
}) {
  if (
    !/^[A-Za-z0-9_-]{3,160}$/.test(input.weddingId) ||
    !/^upload_[a-f0-9]{24}$/.test(input.reservationId) ||
    !/^asset_[a-f0-9]{24}$/.test(input.mediaId)
  ) {
    throw new Error("Upload identity is invalid.");
  }

  const fileName = sanitizeStorageFileName(input.fileName);
  const root = `weddings/${input.weddingId}`;
  const paths: {
    objectPath: string;
    stagingObjectPath: string;
    thumbnailPath?: string;
    thumbnailStagingPath?: string;
  } = {
    objectPath: `${root}/guest/${input.mediaId}-${fileName}`,
    stagingObjectPath: `${root}/upload-staging/${input.reservationId}-${fileName}`,
  };

  if (input.thumbnailFileName) {
    const thumbnailName = sanitizeStorageFileName(input.thumbnailFileName);
    paths.thumbnailPath = `${root}/guest-thumbnail/${input.mediaId}-thumb-${thumbnailName}`;
    paths.thumbnailStagingPath = `${root}/upload-staging/${input.reservationId}-thumb-${thumbnailName}`;
  }
  return paths;
}
