import { createId } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type DeletionJobRow = {
  id: string;
  wedding_id: string;
  media_id: string;
  object_path: string;
  thumbnail_path: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
  last_attempt_at: string | null;
};

function rows<T>(data: unknown) {
  if (!data) return [];
  return (Array.isArray(data) ? data : [data]) as T[];
}

function deletionJob(row: DeletionJobRow) {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    mediaId: row.media_id,
    objectPath: row.object_path,
    thumbnailPath: row.thumbnail_path,
    status: row.status,
    attempts: Number(row.attempts),
    lastError: row.last_error,
    createdAt: row.created_at,
    processedAt: row.processed_at,
    lastAttemptAt: row.last_attempt_at,
  };
}

export async function claimMediaDeletionJobs(now: string, limit = 50) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "claim_media_deletion_jobs_v1",
    { p_limit: limit, p_now: now },
  );
  if (error) throw new Error(error.message);
  return rows<DeletionJobRow>(data).map(deletionJob);
}

export async function finishMediaDeletionJob(input: {
  jobId: string;
  success: boolean;
  error?: string;
  now: string;
}) {
  const { error } = await getSupabaseAdmin().rpc(
    "finish_media_deletion_job_v1",
    {
      p_job_id: input.jobId,
      p_success: input.success,
      p_error: input.error ?? null,
      p_now: input.now,
    },
  );
  if (error) throw new Error(error.message);
}

export async function listPendingCleanupWeddingIds(limit = 100) {
  const { data, error } = await getSupabaseAdmin()
    .from("weddings")
    .select("id")
    .eq("status", "cleanup_pending")
    .order("updated_at", { ascending: true })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 500));
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

export async function finalizeOwnerCleanup(weddingId: string, now: string) {
  const { error } = await getSupabaseAdmin().rpc("owner_finalize_cleanup_v1", {
    p_wedding_id: weddingId,
    p_now: now,
  });
  if (error) throw new Error(error.message);
}

export async function pruneOperationalMetadata(now: string, limit = 500) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "prune_operational_metadata_v1",
    { p_now: now, p_limit: limit },
  );
  if (error) throw new Error(error.message);
  const row = rows<{
    upload_reservations_deleted: number;
    deletion_jobs_deleted: number;
    rate_limit_buckets_deleted: number;
  }>(data)[0];
  return {
    uploadReservationsDeleted: Number(row?.upload_reservations_deleted ?? 0),
    deletionJobsDeleted: Number(row?.deletion_jobs_deleted ?? 0),
    rateLimitBucketsDeleted: Number(row?.rate_limit_buckets_deleted ?? 0),
  };
}

export async function checkSupabaseConnection() {
  const startedAt = performance.now();
  const { error } = await getSupabaseAdmin()
    .from("weddings")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return Math.max(Math.round(performance.now() - startedAt), 0);
}

export async function countCleanupCandidates(now: string) {
  const { count, error } = await getSupabaseAdmin()
    .from("weddings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .lte("cleanup_after", now);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function recordSystemHealth(input: {
  supabaseOk: boolean;
  r2Ok: boolean;
  supabaseLatencyMs?: number;
  r2LatencyMs?: number;
  cleanupCandidateCount: number;
  details: Record<string, unknown>;
  checkedAt: string;
}) {
  const { error } = await getSupabaseAdmin().from("system_health_checks").insert({
    id: createId("health"),
    supabase_ok: input.supabaseOk,
    r2_ok: input.r2Ok,
    supabase_latency_ms: input.supabaseLatencyMs ?? null,
    r2_latency_ms: input.r2LatencyMs ?? null,
    cleanup_candidate_count: input.cleanupCandidateCount,
    details: input.details,
    checked_at: input.checkedAt,
  });
  if (error) throw new Error(error.message);
}
