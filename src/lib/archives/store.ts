import { createId } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MediaKind } from "@/lib/types";
import type { ArchiveStatus } from "@/lib/archives/domain";

type ArchiveJobRow = {
  id: string;
  wedding_id: string;
  status: ArchiveStatus;
  active: boolean;
  source_media_count: number | string;
  source_photo_count: number | string;
  source_video_count: number | string;
  source_audio_count: number | string;
  source_total_bytes: number | string;
  prepared_media_count: number | string;
  prepared_source_bytes: number | string;
  archive_path: string | null;
  archive_file_name: string | null;
  archive_byte_size: number | string | null;
  error_code: string | null;
  error_detail: string | null;
  worker_started_at: string | null;
  attempt_id: string | null;
  lease_expires_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  storage_cleaned_at: string | null;
  storage_cleanup_attempts: number | string;
  storage_cleanup_error: string | null;
  last_cleanup_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

type ArchiveItemRow = {
  archive_job_id: string;
  ordinal: number | string;
  media_id: string;
  kind: MediaKind;
  storage_path: string;
  file_name: string;
  byte_size: number | string;
  guest_name: string;
  note: string | null;
  created_at: string;
};

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return data ? (data as T) : null;
}

function asNonNegativeInteger(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new Error("Archive data contains an invalid numeric value.");
  }
  return numeric;
}

export type ArchiveJob = ReturnType<typeof archiveJobFromRow>;
export type ArchiveJobItem = ReturnType<typeof archiveItemFromRow>;

function archiveJobFromRow(row: ArchiveJobRow) {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    status: row.status,
    active: row.active,
    sourceMediaCount: asNonNegativeInteger(row.source_media_count),
    sourcePhotoCount: asNonNegativeInteger(row.source_photo_count),
    sourceVideoCount: asNonNegativeInteger(row.source_video_count),
    sourceAudioCount: asNonNegativeInteger(row.source_audio_count),
    sourceTotalBytes: asNonNegativeInteger(row.source_total_bytes),
    preparedMediaCount: asNonNegativeInteger(row.prepared_media_count),
    preparedSourceBytes: asNonNegativeInteger(row.prepared_source_bytes),
    archivePath: row.archive_path,
    archiveFileName: row.archive_file_name,
    archiveByteSize:
      row.archive_byte_size === null ? null : asNonNegativeInteger(row.archive_byte_size),
    errorCode: row.error_code,
    errorDetail: row.error_detail,
    workerStartedAt: row.worker_started_at,
    attemptId: row.attempt_id,
    leaseExpiresAt: row.lease_expires_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    storageCleanedAt: row.storage_cleaned_at,
    storageCleanupAttempts: asNonNegativeInteger(row.storage_cleanup_attempts),
    storageCleanupError: row.storage_cleanup_error,
    lastCleanupAttemptAt: row.last_cleanup_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function archiveItemFromRow(row: ArchiveItemRow) {
  return {
    archiveJobId: row.archive_job_id,
    ordinal: asNonNegativeInteger(row.ordinal),
    mediaId: row.media_id,
    kind: row.kind,
    storagePath: row.storage_path,
    fileName: row.file_name,
    byteSize: asNonNegativeInteger(row.byte_size),
    guestName: row.guest_name,
    note: row.note,
    createdAt: row.created_at,
  };
}

async function archiveRpc(
  name: string,
  parameters: Record<string, unknown>,
) {
  const { data, error } = await getSupabaseAdmin().rpc(name, parameters);
  if (error) throw new Error(error.message);
  const row = firstRow<ArchiveJobRow>(data);
  if (!row) throw new Error("Archive operation returned no result.");
  return archiveJobFromRow(row);
}

export async function createOrReuseArchiveJob(weddingId: string) {
  const id = createId("archive");
  const job = await archiveRpc("create_archive_job_v1", {
    p_job_id: id,
    p_wedding_id: weddingId,
    p_now: new Date().toISOString(),
  });
  return { job, created: job.id === id };
}

export async function getLatestArchiveJob(weddingId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("archive_jobs")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? archiveJobFromRow(data as ArchiveJobRow) : null;
}

export async function getArchiveSourceSummary(weddingId: string) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "get_archive_source_summary_v1",
    { p_wedding_id: weddingId },
  );
  if (error) throw new Error(error.message);
  const row = firstRow<{
    media_count: number | string;
    photo_count: number | string;
    video_count: number | string;
    audio_count: number | string;
    total_bytes: number | string;
  }>(data);
  if (!row) {
    return {
      mediaCount: 0,
      photoCount: 0,
      videoCount: 0,
      audioCount: 0,
      totalBytes: 0,
    };
  }
  return {
    mediaCount: asNonNegativeInteger(row.media_count),
    photoCount: asNonNegativeInteger(row.photo_count),
    videoCount: asNonNegativeInteger(row.video_count),
    audioCount: asNonNegativeInteger(row.audio_count),
    totalBytes: asNonNegativeInteger(row.total_bytes),
  };
}

export async function getArchiveJobForWedding(jobId: string, weddingId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("archive_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("wedding_id", weddingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? archiveJobFromRow(data as ArchiveJobRow) : null;
}

export async function getArchiveManifest(jobId: string) {
  const { data: jobData, error: jobError } = await getSupabaseAdmin()
    .from("archive_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!jobData) return null;

  const { data: itemData, error: itemError } = await getSupabaseAdmin()
    .from("archive_job_items")
    .select("*")
    .eq("archive_job_id", jobId)
    .order("ordinal", { ascending: true });
  if (itemError) throw new Error(itemError.message);
  return {
    job: archiveJobFromRow(jobData as ArchiveJobRow),
    items: (itemData ?? []).map((row) => archiveItemFromRow(row as ArchiveItemRow)),
  };
}

async function claimArchiveJobAttempt(jobId: string, attemptId: string) {
  return archiveRpc("claim_archive_job_attempt_v1", {
    p_job_id: jobId,
    p_attempt_id: attemptId,
    p_now: new Date().toISOString(),
  });
}

export function beginArchiveJobAttempt(jobId: string) {
  return claimArchiveJobAttempt(jobId, createId("attempt"));
}

export async function markArchiveJobRunning(jobId: string, attemptId: string) {
  const job = await claimArchiveJobAttempt(jobId, attemptId);
  if (job.attemptId !== attemptId) throw new Error("Archive attempt is stale.");
  return job;
}

export function updateArchiveJobProgress(input: {
  jobId: string;
  attemptId: string;
  preparedMediaCount: number;
  preparedSourceBytes: number;
}) {
  return archiveRpc("update_archive_job_progress_v1", {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_prepared_media_count: input.preparedMediaCount,
    p_prepared_source_bytes: input.preparedSourceBytes,
    p_now: new Date().toISOString(),
  });
}

export function completeArchiveJob(input: {
  jobId: string;
  attemptId: string;
  archivePath: string;
  archiveFileName: string;
  archiveByteSize: number;
}) {
  return archiveRpc("complete_archive_job_v1", {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId,
    p_archive_path: input.archivePath,
    p_archive_file_name: input.archiveFileName,
    p_archive_byte_size: input.archiveByteSize,
    p_now: new Date().toISOString(),
  });
}

export function failArchiveJob(input: {
  jobId: string;
  attemptId?: string;
  errorCode: string;
  errorDetail?: string;
}) {
  return archiveRpc("fail_archive_job_v1", {
    p_job_id: input.jobId,
    p_attempt_id: input.attemptId ?? null,
    p_error_code: input.errorCode,
    p_error_detail: input.errorDetail ?? null,
    p_now: new Date().toISOString(),
  });
}

export async function claimExpiredArchiveJobs(now: string, limit = 25) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "claim_expired_archive_jobs_v1",
    { p_limit: limit, p_now: now },
  );
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((row) =>
    archiveJobFromRow(row as ArchiveJobRow),
  );
}

export function markArchiveStorageCleanup(input: {
  jobId: string;
  success: boolean;
  error?: string;
  now: string;
}) {
  return archiveRpc("mark_archive_storage_cleanup_v1", {
    p_job_id: input.jobId,
    p_success: input.success,
    p_error: input.error ?? null,
    p_now: input.now,
  });
}
