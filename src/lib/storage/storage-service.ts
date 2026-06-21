import type { MediaKind, StoredMediaObject } from "@/lib/types";
import { createId } from "@/lib/security";
import { getSupabaseAdmin, SUPABASE_STORAGE_BUCKET } from "@/lib/supabase/admin";

export const MAX_MEDIA_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_THUMBNAIL_UPLOAD_BYTES = 1024 * 1024;
const ALLOWED_MEDIA_PREFIXES = ["image/", "video/", "audio/"];
type StorageFolder = "profile" | "guest" | "guest-thumbnail";

export type PendingStoredMediaObject = Omit<StoredMediaObject, "url"> & {
  storagePath: string;
};

export type SignedUploadTarget = {
  bucket: string;
  path: string;
  token: string;
  object: PendingStoredMediaObject;
};

export function inferMediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "image";
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
  const mimeType = input.mimeType || "application/octet-stream";
  const kind = inferMediaKind(mimeType);
  const maxBytes = input.maxBytes ?? MAX_MEDIA_UPLOAD_BYTES;

  if (!ALLOWED_MEDIA_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    throw new Error("Only photo, video, or audio files are accepted.");
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
        ? "This file is too large. Please upload a file under 100 MB."
        : "This thumbnail is too large. Please try a smaller preview.",
    );
  }

  return { kind, mimeType };
}

export async function createSignedStorageUrl(
  storagePath: string,
  expiresIn = 60 * 60 * 6,
  download?: string | boolean,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn, download ? { download } : undefined);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Could not create media URL.");
  }

  return data.signedUrl;
}

export async function deleteStoredFile(storagePath?: string | null) {
  if (!storagePath) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([storagePath]);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createSignedUploadTarget(
  file: { name: string; type: string; size: number },
  options: {
    weddingId: string;
    folder: StorageFolder;
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
  const id = createId("asset");
  const storagePath = `${options.weddingId}/${options.folder}/${id}-${sanitizeFileName(file.name)}`;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUploadUrl(storagePath, {
    upsert: false,
  });

  if (error || !data?.token) {
    throw new Error(error?.message ?? "Could not create upload URL.");
  }

  return {
    bucket: SUPABASE_STORAGE_BUCKET,
    path: storagePath,
    token: data.token,
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

export function assertUploadBelongsToWedding(
  object: PendingStoredMediaObject,
  options: {
    weddingId: string;
    folder: StorageFolder;
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

  const expectedPrefix = `${options.weddingId}/${options.folder}/${object.id}-`;

  if (!/^asset_[a-f0-9]{24}$/.test(object.id)) {
    throw new Error("Upload id is invalid.");
  }

  if (!object.storagePath.startsWith(expectedPrefix)) {
    throw new Error("Upload path does not belong to this wedding.");
  }
}

export async function finalizeSignedUpload(
  object: PendingStoredMediaObject,
): Promise<StoredMediaObject> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).info(object.storagePath);

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...object,
    url: await createSignedStorageUrl(object.storagePath),
  };
}
