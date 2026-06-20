import type { MediaKind, StoredMediaObject } from "@/lib/types";
import { createId } from "@/lib/security";

function inferMediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("audio/")) {
    return "audio";
  }

  return "image";
}

export async function storeUploadedFile(file: File): Promise<StoredMediaObject> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = Buffer.from(arrayBuffer);
  const mimeType = file.type || "application/octet-stream";
  const url = `data:${mimeType};base64,${bytes.toString("base64")}`;

  return {
    id: createId("asset"),
    url,
    kind: inferMediaKind(mimeType),
    mimeType,
    fileName: file.name || "upload",
    byteSize: file.size,
    createdAt: new Date().toISOString(),
  };
}
