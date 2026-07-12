import { normalizeOwnerNonNegativeInteger } from "@/lib/owner/numbers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MediaKind } from "@/lib/types";

type ReservationRow = {
  id: string;
  wedding_id: string;
  client_request_key_hash: string;
  secret_hash: string;
  media_id: string;
  mode: "single" | "multipart";
  status: "pending" | "uploading" | "completed" | "aborted" | "expired";
  object_path: string;
  staging_object_path: string;
  thumbnail_path: string | null;
  thumbnail_staging_path: string | null;
  r2_upload_id: string | null;
  kind: MediaKind;
  mime_type: string;
  file_name: string;
  byte_size: number | string;
  part_size_bytes: number | string;
  part_count: number | string;
  thumbnail_mime_type: string | null;
  thumbnail_file_name: string | null;
  thumbnail_byte_size: number | string | null;
  guest_name: string;
  note: string | null;
  expires_at: string;
  created_at: string;
  last_activity_at: string;
  completed_at: string | null;
  aborted_at: string | null;
  thumbnail_completed_at: string | null;
  storage_cleaned_at: string | null;
  storage_cleanup_attempts: number | string;
  storage_cleanup_error: string | null;
};

type PartRow = {
  reservation_id: string;
  part_number: number;
  etag: string;
  byte_size: number | string;
  uploaded_at: string;
};

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data ? (data as T) : null;
}

function reservationFromRow(row: ReservationRow) {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    clientRequestKeyHash: row.client_request_key_hash,
    secretHash: row.secret_hash,
    mediaId: row.media_id,
    mode: row.mode,
    status: row.status,
    objectPath: row.object_path,
    stagingObjectPath: row.staging_object_path,
    thumbnailPath: row.thumbnail_path,
    thumbnailStagingPath: row.thumbnail_staging_path,
    r2UploadId: row.r2_upload_id,
    kind: row.kind,
    mimeType: row.mime_type,
    fileName: row.file_name,
    byteSize: normalizeOwnerNonNegativeInteger(row.byte_size, "upload_byte_size"),
    partSizeBytes: normalizeOwnerNonNegativeInteger(
      row.part_size_bytes,
      "upload_part_size",
    ),
    partCount: normalizeOwnerNonNegativeInteger(row.part_count, "upload_part_count"),
    thumbnailMimeType: row.thumbnail_mime_type,
    thumbnailFileName: row.thumbnail_file_name,
    thumbnailByteSize:
      row.thumbnail_byte_size === null
        ? null
        : normalizeOwnerNonNegativeInteger(
            row.thumbnail_byte_size,
            "upload_thumbnail_size",
          ),
    guestName: row.guest_name,
    note: row.note,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at,
    abortedAt: row.aborted_at,
    thumbnailCompletedAt: row.thumbnail_completed_at,
    storageCleanedAt: row.storage_cleaned_at,
    storageCleanupAttempts: normalizeOwnerNonNegativeInteger(
      row.storage_cleanup_attempts,
      "upload_storage_cleanup_attempts",
    ),
    storageCleanupError: row.storage_cleanup_error,
  };
}

function partFromRow(row: PartRow) {
  return {
    reservationId: row.reservation_id,
    partNumber: row.part_number,
    etag: row.etag,
    byteSize: normalizeOwnerNonNegativeInteger(row.byte_size, "upload_part_size"),
    uploadedAt: row.uploaded_at,
  };
}

async function reservationRpc(
  name: string,
  parameters: Record<string, unknown>,
) {
  const { data, error } = await getSupabaseAdmin().rpc(name, parameters);
  if (error) throw new Error(error.message);
  const row = firstRow<ReservationRow>(data);
  if (!row) throw new Error("Upload reservation operation returned no result.");
  return reservationFromRow(row);
}

export function reserveGuestUpload(input: {
  id: string;
  clientRequestKeyHash: string;
  secretHash: string;
  mediaId: string;
  weddingId: string;
  mode: "single" | "multipart";
  objectPath: string;
  stagingObjectPath: string;
  kind: MediaKind;
  mimeType: string;
  fileName: string;
  byteSize: number;
  partSizeBytes: number;
  partCount: number;
  thumbnailPath?: string;
  thumbnailStagingPath?: string;
  thumbnailMimeType?: string;
  thumbnailFileName?: string;
  thumbnailByteSize?: number;
  guestName: string;
  note?: string;
  now: string;
}) {
  return reservationRpc("reserve_guest_upload_v1", {
    p_id: input.id,
    p_client_request_key_hash: input.clientRequestKeyHash,
    p_secret_hash: input.secretHash,
    p_media_id: input.mediaId,
    p_wedding_id: input.weddingId,
    p_mode: input.mode,
    p_object_path: input.objectPath,
    p_staging_object_path: input.stagingObjectPath,
    p_kind: input.kind,
    p_mime_type: input.mimeType,
    p_file_name: input.fileName,
    p_byte_size: input.byteSize,
    p_part_size_bytes: input.partSizeBytes,
    p_part_count: input.partCount,
    p_thumbnail_path: input.thumbnailPath ?? null,
    p_thumbnail_staging_path: input.thumbnailStagingPath ?? null,
    p_thumbnail_mime_type: input.thumbnailMimeType ?? null,
    p_thumbnail_file_name: input.thumbnailFileName ?? null,
    p_thumbnail_byte_size: input.thumbnailByteSize ?? null,
    p_guest_name: input.guestName,
    p_note: input.note ?? null,
    p_now: input.now,
  });
}

export async function getUploadReservation(
  reservationId: string,
  secretHash: string,
) {
  const { data, error } = await getSupabaseAdmin()
    .from("upload_reservations")
    .select("*")
    .eq("id", reservationId)
    .eq("secret_hash", secretHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? reservationFromRow(data as ReservationRow) : null;
}

export async function listUploadParts(
  reservationId: string,
  secretHash: string,
) {
  const reservation = await getUploadReservation(reservationId, secretHash);
  if (!reservation) return null;
  const { data, error } = await getSupabaseAdmin()
    .from("upload_parts")
    .select("reservation_id,part_number,etag,byte_size,uploaded_at")
    .eq("reservation_id", reservationId)
    .order("part_number", { ascending: true });
  if (error) throw new Error(error.message);
  return {
    reservation,
    parts: ((data ?? []) as PartRow[]).map(partFromRow),
  };
}

export function attachMultipartUpload(input: {
  reservationId: string;
  secretHash: string;
  uploadId: string;
  now: string;
}) {
  return reservationRpc("attach_multipart_upload_v1", {
    p_reservation_id: input.reservationId,
    p_secret_hash: input.secretHash,
    p_r2_upload_id: input.uploadId,
    p_now: input.now,
  });
}

export async function recordUploadPart(input: {
  reservationId: string;
  secretHash: string;
  partNumber: number;
  etag: string;
  byteSize: number;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "record_upload_part_v1",
    {
      p_reservation_id: input.reservationId,
      p_secret_hash: input.secretHash,
      p_part_number: input.partNumber,
      p_etag: input.etag,
      p_byte_size: input.byteSize,
      p_now: input.now,
    },
  );
  if (error) throw new Error(error.message);
  const row = firstRow<PartRow>(data);
  if (!row) throw new Error("Upload part operation returned no result.");
  return partFromRow(row);
}

export function abortUploadReservation(input: {
  reservationId: string;
  secretHash: string;
  now: string;
}) {
  return reservationRpc("abort_upload_reservation_v1", {
    p_reservation_id: input.reservationId,
    p_secret_hash: input.secretHash,
    p_now: input.now,
  });
}

export function expireUploadReservation(input: {
  reservationId: string;
  now: string;
}) {
  return reservationRpc("expire_upload_reservation_v1", {
    p_reservation_id: input.reservationId,
    p_now: input.now,
  });
}

export async function completeUploadReservation(input: {
  reservationId: string;
  secretHash: string;
  thumbnailCompleted: boolean;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "complete_upload_reservation_v1",
    {
      p_reservation_id: input.reservationId,
      p_secret_hash: input.secretHash,
      p_thumbnail_completed: input.thumbnailCompleted,
      p_now: input.now,
    },
  );
  if (error) throw new Error(error.message);
  const row = firstRow<Record<string, unknown>>(data);
  if (!row) throw new Error("Upload completion returned no media.");
  return row;
}

export async function listExpiredUploadReservations(now: string, limit = 100) {
  const { data, error } = await getSupabaseAdmin()
    .from("upload_reservations")
    .select("*")
    .in("status", ["pending", "uploading"])
    .lte("expires_at", now)
    .order("expires_at", { ascending: true })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 500));
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReservationRow[]).map(reservationFromRow);
}

export async function listReleasedUploadReservations(limit = 100) {
  const { data, error } = await getSupabaseAdmin()
    .from("upload_reservations")
    .select("*")
    .in("status", ["aborted", "expired"])
    .is("storage_cleaned_at", null)
    .order("last_activity_at", { ascending: true })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 500));
  if (error) throw new Error(error.message);
  return ((data ?? []) as ReservationRow[]).map(reservationFromRow);
}

export function markUploadStorageCleanup(input: {
  reservationId: string;
  success: boolean;
  error?: string;
  now: string;
}) {
  return reservationRpc("mark_upload_storage_cleanup_v1", {
    p_reservation_id: input.reservationId,
    p_success: input.success,
    p_error: input.error ?? null,
    p_now: input.now,
  });
}
