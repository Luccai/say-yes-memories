import { hashSessionToken } from "@/lib/auth/session-tokens";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWeddingById } from "@/lib/supabase-store";

export type CustomerCredentials = {
  id: string;
  slug: string;
  brideName: string;
  groomName: string;
  passwordHash: string | null;
  passwordVersion: number;
  status: "active" | "disabled" | "cleanup_pending" | "anonymized";
};

type CredentialRow = {
  id: string;
  slug: string;
  bride_name: string;
  groom_name: string;
  password_hash: string | null;
  password_version: number;
  status: CustomerCredentials["status"];
};

type SessionRow = {
  id: string;
  wedding_id: string;
  token_hash: string | null;
  password_version: number;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
};

function credentialsFromRow(row: CredentialRow): CustomerCredentials {
  return {
    id: row.id,
    slug: row.slug,
    brideName: row.bride_name,
    groomName: row.groom_name,
    passwordHash: row.password_hash,
    passwordVersion: row.password_version,
    status: row.status,
  };
}

function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  return data ? (data as T) : null;
}

async function getCredentialsByWeddingId(weddingId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("weddings")
    .select(
      "id,slug,bride_name,groom_name,password_hash,password_version,status",
    )
    .eq("id", weddingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  return data ? credentialsFromRow(data as CredentialRow) : null;
}

export async function getActivationTokenState(tokenHash: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("tokens")
    .select("id,status,wedding_id,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data || data.status === "revoked" || data.revoked_at) {
    return { state: "missing" as const };
  }
  if (data.status === "unused") {
    return { state: "unused" as const };
  }
  if (!data.wedding_id) {
    return { state: "missing" as const };
  }

  const credentials = await getCredentialsByWeddingId(data.wedding_id as string);
  if (!credentials) {
    return { state: "missing" as const };
  }
  return { state: "active" as const, credentials };
}

export async function activateCustomerWedding(input: {
  tokenHash: string;
  activationKeyHash: string;
  weddingId: string;
  sessionId: string;
  sessionTokenHash: string;
  passwordHash: string;
  brideName: string;
  groomName: string;
  eventDate: string;
  timezone: string;
  baseSlug: string;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc("activate_wedding_v2", {
    p_token_hash: input.tokenHash,
    p_activation_key_hash: input.activationKeyHash,
    p_wedding_id: input.weddingId,
    p_session_id: input.sessionId,
    p_session_token_hash: input.sessionTokenHash,
    p_password_hash: input.passwordHash,
    p_bride_name: input.brideName,
    p_groom_name: input.groomName,
    p_event_date: input.eventDate,
    p_timezone: input.timezone,
    p_base_slug: input.baseSlug,
    p_now: input.now,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = firstRpcRow<{
    result_wedding_id: string;
    result_slug: string;
    result_session_id: string;
  }>(data);
  if (!result) {
    throw new Error("Activation RPC returned no membership.");
  }
  return result;
}

export async function claimLegacyCustomerWedding(input: {
  tokenHash: string;
  passwordHash: string;
  eventDate: string;
  timezone: string;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "claim_legacy_wedding_password_v2",
    {
      p_token_hash: input.tokenHash,
      p_password_hash: input.passwordHash,
      p_event_date: input.eventDate,
      p_timezone: input.timezone,
      p_now: input.now,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<CredentialRow>(data);
  if (!result) {
    throw new Error("Legacy claim RPC returned no membership.");
  }
  return credentialsFromRow(result);
}

export async function resolveCustomerBySlug(slug: string) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "resolve_wedding_slug_v2",
    { p_slug: slug },
  );
  if (error) {
    throw new Error(error.message);
  }

  const resolved = firstRpcRow<{
    result_wedding_id: string;
    result_canonical_slug: string;
    result_is_alias: boolean;
  }>(data);
  if (!resolved) {
    return null;
  }

  return getCredentialsByWeddingId(resolved.result_wedding_id);
}

export async function resolveCustomerByActiveToken(tokenHash: string) {
  const state = await getActivationTokenState(tokenHash);
  return state.state === "active" ? state.credentials : null;
}

export async function createCustomerSession(input: {
  weddingId: string;
  sessionId: string;
  sessionTokenHash: string;
  passwordVersion: number;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "create_wedding_session_v2",
    {
      p_wedding_id: input.weddingId,
      p_session_id: input.sessionId,
      p_session_token_hash: input.sessionTokenHash,
      p_password_version: input.passwordVersion,
      p_now: input.now,
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<SessionRow>(data);
  if (!result) {
    throw new Error("Session RPC returned no session.");
  }
  return result;
}

export async function resetCustomerPassword(input: {
  tokenHash: string;
  passwordHash: string;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc(
    "reset_wedding_password_v2",
    {
      p_token_hash: input.tokenHash,
      p_password_hash: input.passwordHash,
      p_now: input.now,
    },
  );
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<CredentialRow>(data);
  if (!result) {
    throw new Error("Password reset RPC returned no membership.");
  }
  return credentialsFromRow(result);
}

export async function getCustomerSession(rawToken: string) {
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("sessions")
    .select(
      "id,wedding_id,token_hash,password_version,created_at,last_seen_at,expires_at,revoked_at",
    )
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const session = data as SessionRow;
  const credentials = await getCredentialsByWeddingId(session.wedding_id);
  if (
    !credentials ||
    credentials.status !== "active" ||
    !credentials.passwordHash ||
    credentials.passwordVersion !== session.password_version
  ) {
    await revokeCustomerSession(rawToken);
    return null;
  }

  const wedding = await getWeddingById(credentials.id);
  if (!wedding) {
    await revokeCustomerSession(rawToken);
    return null;
  }

  return {
    session: {
      id: session.id,
      weddingId: session.wedding_id,
      createdAt: session.created_at,
      expiresAt: session.expires_at,
    },
    wedding,
  };
}

export async function revokeCustomerSession(rawToken: string) {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("sessions")
    .update({ revoked_at: now, expires_at: now })
    .eq("token_hash", hashSessionToken(rawToken))
    .is("revoked_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getCustomerWedding(weddingId: string) {
  return getWeddingById(weddingId);
}

export async function consumeRateLimitBucket(input: {
  keyHash: string;
  action: string;
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
  now: string;
}) {
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit_v1", {
    p_key_hash: input.keyHash,
    p_action: input.action,
    p_max_attempts: input.maxAttempts,
    p_window_seconds: input.windowSeconds,
    p_block_seconds: input.blockSeconds,
    p_now: input.now,
  });
  if (error) {
    throw new Error(error.message);
  }
  const result = firstRpcRow<{
    allowed: boolean;
    retry_after_seconds: number;
    remaining_attempts: number;
  }>(data);
  if (!result) {
    throw new Error("Rate-limit RPC returned no result.");
  }
  return result;
}

export async function clearRateLimitBucket(keyHash: string, action: string) {
  const { error } = await getSupabaseAdmin().rpc("clear_rate_limit_v1", {
    p_key_hash: keyHash,
    p_action: action,
  });
  if (error) {
    throw new Error(error.message);
  }
}
