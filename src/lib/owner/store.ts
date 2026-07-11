import { hashOwnerSessionToken } from "@/lib/owner/session-tokens";
import { normalizeOwnerNonNegativeInteger } from "@/lib/owner/numbers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type OwnerCredentials = {
  passwordHash: string;
  passwordVersion: number;
  setupCompletedAt: string;
  passwordChangedAt: string;
};

export type OwnerSessionRow = {
  id: string;
  token_hash: string;
  password_version: number;
  device_label: string | null;
  user_agent_hash: string | null;
  ip_hash: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type OwnerTokenRow = {
  id: string;
  token_hash: string;
  status: "unused" | "active" | "revoked";
  wedding_id: string | null;
  label: string | null;
  created_at: string;
  activated_at: string | null;
  revoked_at: string | null;
  rotated_from_id: string | null;
};

type OwnerCredentialRow = {
  password_hash: string;
  password_version: number;
  setup_completed_at: string;
  password_changed_at: string;
};

function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  return data ? (data as T) : null;
}

export async function getOwnerCredentials(): Promise<OwnerCredentials | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("owner_credentials")
    .select(
      "password_hash,password_version,setup_completed_at,password_changed_at",
    )
    .eq("id", "primary")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const row = data as OwnerCredentialRow;
  return {
    passwordHash: row.password_hash,
    passwordVersion: row.password_version,
    setupCompletedAt: row.setup_completed_at,
    passwordChangedAt: row.password_changed_at,
  };
}

async function ownerSessionRpc(
  name: string,
  parameters: Record<string, unknown>,
) {
  const { data, error } = await getSupabaseAdmin().rpc(name, parameters);
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<OwnerSessionRow>(data);
  if (!result) {
    throw new Error("Owner session operation returned no session.");
  }
  return result;
}

export function setupOwner(input: {
  passwordHash: string;
  sessionId: string;
  sessionTokenHash: string;
  deviceLabel: string;
  userAgentHash: string;
  ipHash: string;
  now: string;
}) {
  return ownerSessionRpc("owner_setup_v1", {
    p_password_hash: input.passwordHash,
    p_session_id: input.sessionId,
    p_session_token_hash: input.sessionTokenHash,
    p_device_label: input.deviceLabel,
    p_user_agent_hash: input.userAgentHash,
    p_ip_hash: input.ipHash,
    p_now: input.now,
  });
}

export function createOwnerSession(input: {
  sessionId: string;
  sessionTokenHash: string;
  passwordVersion: number;
  deviceLabel: string;
  userAgentHash: string;
  ipHash: string;
  now: string;
}) {
  return ownerSessionRpc("owner_create_session_v1", {
    p_session_id: input.sessionId,
    p_session_token_hash: input.sessionTokenHash,
    p_password_version: input.passwordVersion,
    p_device_label: input.deviceLabel,
    p_user_agent_hash: input.userAgentHash,
    p_ip_hash: input.ipHash,
    p_now: input.now,
  });
}

export async function touchOwnerSession(rawToken: string) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "owner_touch_session_v1",
    {
      p_session_token_hash: hashOwnerSessionToken(rawToken),
      p_now: new Date().toISOString(),
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  return firstRpcRow<OwnerSessionRow>(data);
}

export async function logoutOwnerSession(rawToken: string) {
  const { error } = await getSupabaseAdmin().rpc("owner_logout_v1", {
    p_session_token_hash: hashOwnerSessionToken(rawToken),
    p_now: new Date().toISOString(),
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function listOwnerSessions() {
  const { data, error } = await getSupabaseAdmin()
    .from("owner_sessions")
    .select(
      "id,password_version,device_label,created_at,last_seen_at,expires_at,revoked_at",
    )
    .order("last_seen_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Array<Omit<OwnerSessionRow, "token_hash" | "user_agent_hash" | "ip_hash">>;
}

export function revokeOwnerDeviceSession(input: {
  actorSessionId: string;
  targetSessionId: string;
  operationKey: string;
  now: string;
}) {
  return ownerSessionRpc("owner_revoke_session_v1", {
    p_actor_session_id: input.actorSessionId,
    p_target_session_id: input.targetSessionId,
    p_operation_key: input.operationKey,
    p_now: input.now,
  });
}

export function changeOwnerPassword(input: {
  actorSessionId: string;
  expectedPasswordVersion: number;
  passwordHash: string;
  newSessionId: string;
  newSessionTokenHash: string;
  deviceLabel: string;
  userAgentHash: string;
  ipHash: string;
  operationKey: string;
  now: string;
}) {
  return ownerSessionRpc("owner_change_password_v1", {
    p_actor_session_id: input.actorSessionId,
    p_expected_password_version: input.expectedPasswordVersion,
    p_password_hash: input.passwordHash,
    p_new_session_id: input.newSessionId,
    p_new_session_token_hash: input.newSessionTokenHash,
    p_device_label: input.deviceLabel,
    p_user_agent_hash: input.userAgentHash,
    p_ip_hash: input.ipHash,
    p_operation_key: input.operationKey,
    p_now: input.now,
  });
}

async function ownerTokenRpc(
  name: string,
  parameters: Record<string, unknown>,
) {
  const { data, error } = await getSupabaseAdmin().rpc(name, parameters);
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<OwnerTokenRow>(data);
  if (!result) {
    throw new Error("Owner token operation returned no token.");
  }
  return result;
}

export function issueOwnerToken(input: {
  actorSessionId: string;
  tokenId: string;
  tokenHash: string;
  label: string;
  operationKey: string;
  now: string;
}) {
  return ownerTokenRpc("owner_issue_token_v1", {
    p_actor_session_id: input.actorSessionId,
    p_token_id: input.tokenId,
    p_token_hash: input.tokenHash,
    p_label: input.label,
    p_operation_key: input.operationKey,
    p_now: input.now,
  });
}

export function rotateOwnerToken(input: {
  actorSessionId: string;
  oldTokenId: string;
  newTokenId: string;
  newTokenHash: string;
  label: string;
  operationKey: string;
  now: string;
}) {
  return ownerTokenRpc("owner_rotate_token_v1", {
    p_actor_session_id: input.actorSessionId,
    p_old_token_id: input.oldTokenId,
    p_new_token_id: input.newTokenId,
    p_new_token_hash: input.newTokenHash,
    p_label: input.label,
    p_operation_key: input.operationKey,
    p_now: input.now,
  });
}

export function revokeOwnerToken(input: {
  actorSessionId: string;
  tokenId: string;
  reason: string;
  operationKey: string;
  now: string;
}) {
  return ownerTokenRpc("owner_revoke_token_v1", {
    p_actor_session_id: input.actorSessionId,
    p_token_id: input.tokenId,
    p_reason: input.reason,
    p_operation_key: input.operationKey,
    p_now: input.now,
  });
}

async function ownerWeddingRpc(
  name: string,
  parameters: Record<string, unknown>,
) {
  const { data, error } = await getSupabaseAdmin().rpc(name, parameters);
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<Record<string, unknown>>(data);
  if (!result) {
    throw new Error("Owner wedding operation returned no membership.");
  }
  return result;
}

export function updateOwnerWeddingIdentity(input: {
  weddingId: string;
  brideName: string;
  groomName: string;
  eventDate: string;
  timezone: string;
  baseSlug: string;
  operationKey: string;
  note?: string;
  now: string;
}) {
  return ownerWeddingRpc("owner_update_wedding_identity_v2", {
    p_wedding_id: input.weddingId,
    p_bride_name: input.brideName,
    p_groom_name: input.groomName,
    p_event_date: input.eventDate,
    p_timezone: input.timezone,
    p_base_slug: input.baseSlug,
    p_operation_key: input.operationKey,
    p_note: input.note ?? null,
    p_now: input.now,
  });
}

export function applyOwnerPremiumExtension(input: {
  weddingId: string;
  operationKey: string;
  note?: string;
  now: string;
}) {
  return ownerWeddingRpc("apply_premium_extension_v2", {
    p_wedding_id: input.weddingId,
    p_operation_key: input.operationKey,
    p_note: input.note ?? null,
    p_now: input.now,
  });
}

export function reverseOwnerEntitlement(input: {
  eventId: string;
  operationKey: string;
  reason: string;
  now: string;
}) {
  return ownerWeddingRpc("reverse_entitlement_event_v2", {
    p_event_id: input.eventId,
    p_operation_key: input.operationKey,
    p_reason: input.reason,
    p_now: input.now,
  });
}

export async function approveOwnerCleanup(input: {
  actorSessionId: string;
  weddingId: string;
  operationKey: string;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "owner_approve_cleanup_v1",
    {
      p_actor_session_id: input.actorSessionId,
      p_wedding_id: input.weddingId,
      p_operation_key: input.operationKey,
      p_now: input.now,
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<{
    result_wedding_id: string;
    jobs_queued: number | string;
    bytes_queued: number | string;
  }>(data);
  if (!result) {
    throw new Error("Cleanup approval returned no result.");
  }
  return {
    ...result,
    jobs_queued: normalizeOwnerNonNegativeInteger(result.jobs_queued, "jobs_queued"),
    bytes_queued: normalizeOwnerNonNegativeInteger(result.bytes_queued, "bytes_queued"),
  };
}
