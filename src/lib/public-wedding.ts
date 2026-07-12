import type {
  PublicStoredMediaObject,
  PublicWedding,
  StoredMediaObject,
  Wedding,
} from "@/lib/types";

function toPublicStoredMediaObject(media: StoredMediaObject): PublicStoredMediaObject {
  return {
    id: media.id,
    url: media.url,
    kind: media.kind,
    mimeType: media.mimeType,
    fileName: media.fileName,
    byteSize: media.byteSize,
    createdAt: media.createdAt,
  };
}

export function toPublicWedding(wedding: Wedding): PublicWedding {
  return {
    id: wedding.id,
    slug: wedding.slug,
    plan: wedding.plan,
    storageQuotaBytes: wedding.storageQuotaBytes,
    storageUsedBytes: wedding.storageUsedBytes,
    accessAnchorDate: wedding.accessAnchorDate,
    accessExpiresAt: wedding.accessExpiresAt,
    cleanupAfter: wedding.cleanupAfter,
    uploadsOpenAt: wedding.uploadsOpenAt,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    coupleName: wedding.coupleName,
    eventDate: wedding.eventDate,
    welcomeNote: wedding.welcomeNote,
    profileMedia: wedding.profileMedia
      ? toPublicStoredMediaObject(wedding.profileMedia)
      : undefined,
    uploadLocked: wedding.uploadLocked,
  };
}
