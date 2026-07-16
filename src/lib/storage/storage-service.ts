import type { MediaKind, StoredMediaObject } from "@/lib/types";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@/lib/security";
import { getR2Client, R2_BUCKET } from "@/lib/storage/r2-client";
import {
  MAX_GUEST_UPLOAD_BYTES,
  MAX_THUMBNAIL_UPLOAD_BYTES,
  mediaSignatureMatches,
  supportedMediaKind,
  validateMediaFileName,
} from "@/lib/uploads/domain";

export const MAX_MEDIA_UPLOAD_BYTES = MAX_GUEST_UPLOAD_BYTES;
export { MAX_THUMBNAIL_UPLOAD_BYTES };
type StorageFolder = "profile" | "guest" | "guest-thumbnail";

export type PendingStoredMediaObject = Omit<StoredMediaObject, "url"> & {
  storagePath: string;
};

export type SignedUploadTarget = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  object: PendingStoredMediaObject;
};

export function inferMediaKind(mimeType: string): MediaKind {
  return supportedMediaKind(mimeType) ?? "image";
}

function normalizeMimeType(mimeType: string) {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function sanitizeFileName(fileName: string) {
  const name = fileName.trim() || "upload";
  const parts = name.split(".");
  const extension = parts.length > 1 ? parts.pop() : "";
  const base = parts
    .join(".")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "memory";

  return extension ? `${base}.${extension.toLowerCase()}` : base;
}

export function validateMediaUpload(input: {
  mimeType: string;
  byteSize: number;
  allowedKinds?: MediaKind[];
  maxBytes?: number;
}) {
  const mimeType = normalizeMimeType(input.mimeType || "application/octet-stream");
  const kind = supportedMediaKind(mimeType);
  const maxBytes = input.maxBytes ?? MAX_MEDIA_UPLOAD_BYTES;

  if (!kind) {
    throw new Error("Only supported photo, video, or audio files are accepted.");
  }

  if (input.allowedKinds && !input.allowedKinds.includes(kind)) {
    throw new Error("This upload type is not accepted here.");
  }

  if (!Number.isFinite(input.byteSize) || input.byteSize <= 0) {
    throw new Error("The selected file is empty.");
  }

  if (input.byteSize > maxBytes) {
    throw new Error(
      maxBytes === MAX_MEDIA_UPLOAD_BYTES
        ? "Files can be up to 5 GiB."
        : "This thumbnail is too large. Please try a smaller preview.",
    );
  }

  return { kind, mimeType };
}

export type ReservationSignedTarget = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
};

export async function createReservationSignedTarget(input: {
  storagePath: string;
  mimeType: string;
  byteSize: number;
  maxBytes?: number;
  allowedKinds?: MediaKind[];
}) {
  const { mimeType } = validateMediaUpload({
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    maxBytes: input.maxBytes,
    allowedKinds: input.allowedKinds,
  });
  const headers = { "Content-Type": mimeType };
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: input.storagePath,
      ContentType: mimeType,
      ContentLength: input.byteSize,
    }),
    { expiresIn: 15 * 60 },
  );
  return { uploadUrl, method: "PUT" as const, headers };
}

export async function createMultipartR2Upload(input: {
  storagePath: string;
  mimeType: string;
}) {
  const response = await getR2Client().send(
    new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: input.storagePath,
      ContentType: normalizeMimeType(input.mimeType),
    }),
  );
  if (!response.UploadId) {
    throw new Error("Multipart upload could not be created.");
  }
  return response.UploadId;
}

export async function createSignedMultipartPart(input: {
  storagePath: string;
  uploadId: string;
  partNumber: number;
  expectedByteSize: number;
}) {
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new UploadPartCommand({
      Bucket: R2_BUCKET,
      Key: input.storagePath,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
      ContentLength: input.expectedByteSize,
    }),
    { expiresIn: 15 * 60 },
  );
  return { uploadUrl, method: "PUT" as const, headers: {} };
}

export async function completeMultipartR2Upload(input: {
  storagePath: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}) {
  await getR2Client().send(
    new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: input.storagePath,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: input.parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    }),
  );
}

export async function abortMultipartR2Upload(input: {
  storagePath: string;
  uploadId: string;
}) {
  await getR2Client().send(
    new AbortMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: input.storagePath,
      UploadId: input.uploadId,
    }),
  );
}

export function isNoSuchMultipartUpload(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; Code?: string; code?: string };
  return (
    candidate.name === "NoSuchUpload" ||
    candidate.Code === "NoSuchUpload" ||
    candidate.code === "NoSuchUpload"
  );
}

export async function checkR2Connection() {
  const startedAt = performance.now();
  await getR2Client().send(
    new ListObjectsV2Command({ Bucket: R2_BUCKET, MaxKeys: 1 }),
  );
  return Math.max(Math.round(performance.now() - startedAt), 0);
}

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export async function headR2Object(storagePath: string) {
  try {
    const response = await getR2Client().send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: storagePath }),
    );
    return {
      exists: true as const,
      byteSize: Number(response.ContentLength ?? 0),
      etag: response.ETag ?? null,
      mimeType: response.ContentType ?? null,
    };
  } catch (error) {
    if (isNotFound(error)) return { exists: false as const };
    throw error;
  }
}

export async function assertStoredMediaSignature(
  storagePath: string,
  mimeType: string,
) {
  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
      Range: "bytes=0-63",
    }),
  );
  if (!response.Body) throw new Error("Uploaded file could not be inspected.");
  const bytes = await response.Body.transformToByteArray();
  if (!mediaSignatureMatches(bytes, mimeType)) {
    throw new Error("Uploaded content does not match its declared media type.");
  }
}

function copySource(storagePath: string) {
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${R2_BUCKET}/${encodedPath}`;
}

export async function promoteStagedObject(input: {
  stagingPath: string;
  finalPath: string;
  expectedByteSize: number;
  mimeType: string;
}) {
  const finalObject = await headR2Object(input.finalPath);
  if (finalObject.exists) {
    if (finalObject.byteSize !== input.expectedByteSize) {
      throw new Error("Final upload size does not match its reservation.");
    }
    await deleteStoredFile(input.stagingPath);
    return;
  }

  const stagedObject = await headR2Object(input.stagingPath);
  if (!stagedObject.exists || stagedObject.byteSize !== input.expectedByteSize) {
    throw new Error("Uploaded file size does not match its reservation.");
  }
  await getR2Client().send(
    new CopyObjectCommand({
      Bucket: R2_BUCKET,
      Key: input.finalPath,
      CopySource: copySource(input.stagingPath),
      ContentType: normalizeMimeType(input.mimeType),
      MetadataDirective: "REPLACE",
    }),
  );
  const copied = await headR2Object(input.finalPath);
  if (!copied.exists || copied.byteSize !== input.expectedByteSize) {
    throw new Error("Final upload could not be verified.");
  }
  await deleteStoredFile(input.stagingPath);
}

export async function createSignedStorageUrl(
  storagePath: string,
  expiresIn = 60 * 60 * 6,
  download?: string | boolean,
) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storagePath,
    ResponseContentDisposition:
      typeof download === "string"
        ? `attachment; filename="${download.replace(/"/g, "")}"`
        : download
          ? "attachment"
          : undefined,
  });

  return getSignedUrl(getR2Client(), command, { expiresIn });
}

export async function deleteStoredFile(storagePath?: string | null) {
  if (!storagePath) {
    return;
  }

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
    }),
  );
}

export async function deleteArchiveJobPrefix(weddingId: string, jobId: string) {
  if (
    !/^[a-zA-Z0-9_-]{8,160}$/.test(weddingId) ||
    !/^archive_[a-f0-9]{24}$/.test(jobId)
  ) {
    throw new Error("Archive cleanup prefix is invalid.");
  }
  const prefix = `archives/${weddingId}/${jobId}/`;
  let continuationToken: string | undefined;
  do {
    const page = await getR2Client().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    await Promise.all(
      (page.Contents ?? []).map((object) =>
        object.Key ? deleteStoredFile(object.Key) : Promise.resolve(),
      ),
    );
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

function storagePrefixFor(weddingId: string, folder: StorageFolder) {
  return `weddings/${weddingId}/${folder}`;
}

export async function createProfileSignedUploadTarget(
  file: { name: string; type: string; size: number },
  options: {
    weddingId: string;
    allowedKinds?: MediaKind[];
    maxBytes?: number;
  },
): Promise<SignedUploadTarget> {
  const { kind, mimeType } = validateMediaUpload({
    mimeType: file.type,
    byteSize: file.size,
    allowedKinds: options.allowedKinds,
    maxBytes: options.maxBytes,
  });
  validateMediaFileName(file.name, mimeType);
  const id = createId("asset");
  const storagePath = `profile-staging/${options.weddingId}/${id}-${sanitizeFileName(file.name)}`;
  const headers = {
    "Content-Type": mimeType,
  };
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: storagePath,
      ContentType: mimeType,
      ContentLength: file.size,
    }),
    { expiresIn: 5 * 60 },
  );

  return {
    uploadUrl,
    method: "PUT",
    headers,
    object: {
      id,
      storagePath,
      kind,
      mimeType,
      fileName: file.name || "upload",
      byteSize: file.size,
      createdAt: new Date().toISOString(),
    },
  };
}

export function assertProfileUploadBelongsToWedding(
  object: PendingStoredMediaObject,
  options: {
    weddingId: string;
    allowedKinds?: MediaKind[];
    maxBytes?: number;
  },
) {
  validateMediaUpload({
    mimeType: object.mimeType,
    byteSize: object.byteSize,
    allowedKinds: options.allowedKinds,
    maxBytes: options.maxBytes,
  });
  validateMediaFileName(object.fileName, object.mimeType);

  const expectedPath = `profile-staging/${options.weddingId}/${object.id}-${sanitizeFileName(object.fileName)}`;

  if (!/^asset_[a-f0-9]{24}$/.test(object.id)) {
    throw new Error("Upload id is invalid.");
  }

  if (object.storagePath !== expectedPath) {
    throw new Error("Upload path does not belong to this wedding.");
  }
}

export async function finalizeProfileSignedUpload(
  object: PendingStoredMediaObject,
  weddingId: string,
): Promise<StoredMediaObject> {
  const finalPath = `${storagePrefixFor(weddingId, "profile")}/${object.id}-${sanitizeFileName(object.fileName)}`;
  await assertStoredMediaSignature(object.storagePath, object.mimeType);
  await promoteStagedObject({
    stagingPath: object.storagePath,
    finalPath,
    expectedByteSize: object.byteSize,
    mimeType: object.mimeType,
  });

  return {
    ...object,
    storagePath: finalPath,
    url: await createSignedStorageUrl(finalPath),
  };
}

export async function listStaleProfileStagingObjects(
  cutoff: Date,
  limit = 200,
) {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const page = await getR2Client().send(
      new ListObjectsV2Command({
        Bucket: R2_BUCKET,
        Prefix: "profile-staging/",
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified <= cutoff) {
        keys.push(object.Key);
        if (keys.length >= limit) return keys;
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}
