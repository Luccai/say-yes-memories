import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeOwnerNonNegativeInteger } from "@/lib/owner/numbers";

type OverviewRow = {
  total_memberships: number | string;
  active_memberships: number | string;
  upcoming_weddings: number | string;
  expired_memberships: number | string;
  cleanup_candidates: number | string;
  guest_storage_bytes: number | string;
  system_storage_bytes: number | string;
  reserved_storage_bytes: number | string;
  media_count: number | string;
  unused_tokens: number | string;
};

type WeddingSummaryRow = {
  id: string;
  slug: string;
  couple_name: string;
  event_date: string | null;
  timezone: string;
  plan: string;
  status: string;
  storage_quota_bytes: number | string;
  storage_used_bytes: number | string;
  reserved_storage_bytes: number | string;
  system_storage_bytes: number | string;
  access_expires_at: string | null;
  cleanup_after: string | null;
  uploads_open_at: string | null;
  upload_locked: boolean;
  has_profile: boolean;
  media_count: number | string;
  created_at: string;
  activated_at: string | null;
  updated_at: string;
  total_count: number | string;
};

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  return data ? (data as T) : null;
}

function numberValue(value: number | string | null | undefined) {
  return normalizeOwnerNonNegativeInteger(value ?? 0, "owner_query_value");
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value ?? fallback), minimum), maximum);
}

export function mapOwnerWeddingSummary(row: WeddingSummaryRow) {
  return {
    id: row.id,
    slug: row.slug,
    coupleName: row.couple_name,
    eventDate: row.event_date,
    timezone: row.timezone,
    plan: row.plan,
    status: row.status,
    storageQuotaBytes: numberValue(row.storage_quota_bytes),
    storageUsedBytes: numberValue(row.storage_used_bytes),
    reservedStorageBytes: numberValue(row.reserved_storage_bytes),
    systemStorageBytes: numberValue(row.system_storage_bytes),
    accessExpiresAt: row.access_expires_at,
    cleanupAfter: row.cleanup_after,
    uploadsOpenAt: row.uploads_open_at,
    uploadLocked: row.upload_locked,
    hasProfile: row.has_profile,
    mediaCount: numberValue(row.media_count),
    createdAt: row.created_at,
    activatedAt: row.activated_at,
    updatedAt: row.updated_at,
  };
}

export async function getOwnerOverview() {
  const { data, error } = await getSupabaseAdmin().rpc("owner_overview_v1", {
    p_now: new Date().toISOString(),
  });
  if (error) {
    throw new Error(error.message);
  }
  const row = firstRow<OverviewRow>(data);
  if (!row) {
    throw new Error("Owner overview returned no result.");
  }

  const { data: healthRows, error: healthError } = await getSupabaseAdmin()
    .from("system_health_checks")
    .select(
      "id,supabase_ok,r2_ok,supabase_latency_ms,r2_latency_ms,cleanup_candidate_count,details,checked_at",
    )
    .order("checked_at", { ascending: false })
    .limit(1);
  if (healthError) {
    throw new Error(healthError.message);
  }

  return {
    totalMemberships: numberValue(row.total_memberships),
    activeMemberships: numberValue(row.active_memberships),
    upcomingWeddings: numberValue(row.upcoming_weddings),
    expiredMemberships: numberValue(row.expired_memberships),
    cleanupCandidates: numberValue(row.cleanup_candidates),
    guestStorageBytes: numberValue(row.guest_storage_bytes),
    systemStorageBytes: numberValue(row.system_storage_bytes),
    reservedStorageBytes: numberValue(row.reserved_storage_bytes),
    mediaCount: numberValue(row.media_count),
    unusedTokens: numberValue(row.unused_tokens),
    latestHealth: healthRows?.[0] ?? null,
  };
}

export async function listOwnerWeddings(input: {
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = boundedInteger(input.limit, 50, 1, 200);
  const offset = boundedInteger(input.offset, 0, 0, 1_000_000);
  const { data, error } = await getSupabaseAdmin().rpc(
    "owner_list_weddings_v1",
    {
      p_search: input.search?.trim().slice(0, 160) || null,
      p_limit: limit,
      p_offset: offset,
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  const rows = (data ?? []) as WeddingSummaryRow[];
  return {
    weddings: rows.map(mapOwnerWeddingSummary),
    total: rows.length ? numberValue(rows[0].total_count) : 0,
  };
}

export async function getOwnerWeddingDetail(weddingId: string) {
  const supabase = getSupabaseAdmin();
  const [weddingResult, slugsResult, entitlementsResult, auditResult, tokensResult, mediaResult] =
    await Promise.all([
      supabase
        .from("weddings")
        .select(
          "id,slug,studio_code,bride_name,groom_name,couple_name,event_date,timezone,plan,status,storage_quota_bytes,storage_used_bytes,reserved_storage_bytes,system_storage_bytes,access_anchor_date,access_expires_at,cleanup_after,uploads_open_at,upload_locked,welcome_note,profile_media_path,created_at,activated_at,updated_at",
        )
        .eq("id", weddingId)
        .maybeSingle(),
      supabase
        .from("wedding_slugs")
        .select("slug,is_canonical,created_at")
        .eq("wedding_id", weddingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("entitlement_events")
        .select(
          "id,operation_key,event_type,quota_delta_bytes,access_delta_months,applied_at,reverses_event_id,note,metadata,created_at",
        )
        .eq("wedding_id", weddingId)
        .order("applied_at", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("owner_audit_logs")
        .select("id,actor_session_id,action,operation_key,details,created_at")
        .eq("wedding_id", weddingId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("tokens")
        .select(
          "id,status,label,created_at,activated_at,revoked_at,rotated_from_id",
        )
        .eq("wedding_id", weddingId)
        .order("created_at", { ascending: false }),
      supabase
        .from("wedding_media")
        .select("id", { count: "exact", head: true })
        .eq("wedding_id", weddingId),
    ]);

  const firstError = [
    weddingResult.error,
    slugsResult.error,
    entitlementsResult.error,
    auditResult.error,
    tokensResult.error,
    mediaResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error(firstError.message);
  }
  if (!weddingResult.data) {
    return null;
  }

  const row = weddingResult.data as Record<string, unknown>;
  return {
    wedding: {
      id: String(row.id),
      slug: String(row.slug),
      studioCode: String(row.studio_code),
      brideName: String(row.bride_name),
      groomName: String(row.groom_name),
      coupleName: String(row.couple_name),
      eventDate: row.event_date as string | null,
      timezone: String(row.timezone),
      plan: String(row.plan),
      status: String(row.status),
      storageQuotaBytes: numberValue(row.storage_quota_bytes as number | string),
      storageUsedBytes: numberValue(row.storage_used_bytes as number | string),
      reservedStorageBytes: numberValue(row.reserved_storage_bytes as number | string),
      systemStorageBytes: numberValue(row.system_storage_bytes as number | string),
      accessAnchorDate: row.access_anchor_date as string | null,
      accessExpiresAt: row.access_expires_at as string | null,
      cleanupAfter: row.cleanup_after as string | null,
      uploadsOpenAt: row.uploads_open_at as string | null,
      uploadLocked: Boolean(row.upload_locked),
      welcomeNote: String(row.welcome_note ?? ""),
      hasProfile: Boolean(row.profile_media_path),
      mediaCount: mediaResult.count ?? 0,
      createdAt: String(row.created_at),
      activatedAt: row.activated_at as string | null,
      updatedAt: String(row.updated_at),
    },
    slugs: slugsResult.data ?? [],
    entitlements: entitlementsResult.data ?? [],
    audits: auditResult.data ?? [],
    tokens: tokensResult.data ?? [],
  };
}

export async function getOwnerWeddingProfilePath(weddingId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("weddings")
    .select("profile_media_path")
    .eq("id", weddingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.profile_media_path as string | null | undefined) ?? null;
}

async function weddingLabels(weddingIds: string[]) {
  if (!weddingIds.length) {
    return new Map<string, { coupleName: string; slug: string }>();
  }
  const { data, error } = await getSupabaseAdmin()
    .from("weddings")
    .select("id,couple_name,slug")
    .in("id", weddingIds);
  if (error) {
    throw new Error(error.message);
  }
  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      { coupleName: row.couple_name as string, slug: row.slug as string },
    ]),
  );
}

export async function listOwnerTokens(input: { limit?: number; offset?: number } = {}) {
  const limit = boundedInteger(input.limit, 100, 1, 200);
  const offset = boundedInteger(input.offset, 0, 0, 1_000_000);
  const { data, error, count } = await getSupabaseAdmin()
    .from("tokens")
    .select(
      "id,status,wedding_id,label,created_at,activated_at,revoked_at,rotated_from_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    throw new Error(error.message);
  }
  const rows = data ?? [];
  const labels = await weddingLabels(
    [...new Set(rows.map((row) => row.wedding_id).filter(Boolean))] as string[],
  );

  return {
    tokens: rows.map((row) => ({
      id: row.id,
      status: row.status,
      label: row.label,
      weddingId: row.wedding_id,
      wedding: row.wedding_id ? labels.get(row.wedding_id) ?? null : null,
      createdAt: row.created_at,
      activatedAt: row.activated_at,
      revokedAt: row.revoked_at,
      rotatedFromId: row.rotated_from_id,
    })),
    total: count ?? rows.length,
  };
}

export async function listOwnerAudit(limit = 100) {
  const { data, error } = await getSupabaseAdmin()
    .from("owner_audit_logs")
    .select(
      "id,actor_session_id,action,wedding_id,operation_key,details,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) {
    throw new Error(error.message);
  }
  const rows = data ?? [];
  const labels = await weddingLabels(
    [...new Set(rows.map((row) => row.wedding_id).filter(Boolean))] as string[],
  );

  return rows.map((row) => ({
    id: row.id,
    actorSessionId: row.actor_session_id,
    action: row.action,
    weddingId: row.wedding_id,
    wedding: row.wedding_id ? labels.get(row.wedding_id) ?? null : null,
    operationKey: row.operation_key,
    details: row.details,
    createdAt: row.created_at,
  }));
}

export async function listOwnerHealth(limit = 30) {
  const { data, error } = await getSupabaseAdmin()
    .from("system_health_checks")
    .select(
      "id,supabase_ok,r2_ok,supabase_latency_ms,r2_latency_ms,cleanup_candidate_count,details,checked_at",
    )
    .order("checked_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function listOwnerCleanupCandidates() {
  const { data, error } = await getSupabaseAdmin().rpc(
    "owner_list_cleanup_candidates_v1",
    { p_now: new Date().toISOString() },
  );
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as WeddingSummaryRow[]).map(mapOwnerWeddingSummary);
}
