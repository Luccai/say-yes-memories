import type { MediaKind } from "@/lib/types";

export type ClientSignedUploadTarget = {
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  object: {
    id: string;
    storagePath: string;
    kind: MediaKind;
    mimeType: string;
    fileName: string;
    byteSize: number;
    createdAt: string;
  };
};

export async function uploadToSignedTarget(target: ClientSignedUploadTarget, file: File) {
  const response = await fetch(target.uploadUrl, {
    method: target.method,
    headers: target.headers,
    body: file,
  });

  if (!response.ok) {
    throw new Error("Upload could not be completed.");
  }
}
