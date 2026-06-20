import type { MediaKind, StoredMediaObject } from "@/lib/types";
import { createId } from "@/lib/security";
import { getSupabaseAdmin, SUPABASE_STORAGE_BUCKET } from "@/lib/supabase/admin";

function inferMediaKind(mimeType: string): MediaKind {
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

export async function createSignedStorageUrl(storagePath: string, expiresIn = 60 * 60 * 6) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

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
  await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([storagePath]);
}

export async function storeUploadedFile(
  file: File,
  options: { weddingId: string; folder: "profile" | "guest" },
): Promise<StoredMediaObject> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const mimeType = file.type || "application/octet-stream";
  const id = createId("asset");
  const storagePath = `${options.weddingId}/${options.folder}/${id}-${sanitizeFileName(file.name)}`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(storagePath, bytes, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return {
    id,
    url: await createSignedStorageUrl(storagePath),
    storagePath,
    kind: inferMediaKind(mimeType),
    mimeType,
    fileName: file.name || "upload",
    byteSize: file.size,
    createdAt: new Date().toISOString(),
  };
}
