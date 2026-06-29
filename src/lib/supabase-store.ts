import type {
  PublicWedding,
  SessionRecord,
  StoredMediaObject,
  TokenRecord,
  Wedding,
  WeddingMedia,
  WeddingPlan,
} from "@/lib/types";
import { createId, createStudioCode, hashToken, SESSION_MAX_AGE_SECONDS } from "@/lib/security";
import { makeBaseWeddingSlug, makeCoupleName } from "@/lib/text";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSignedStorageUrl, deleteStoredFile } from "@/lib/storage/storage-service";
import {
  buildAccessWindow,
  buildActivationFallbackWindow,
  CLASSIC_ACCESS_MONTHS,
  CLASSIC_STORAGE_BYTES,
  PREMIUM_EXTENSION_MONTHS,
} from "@/lib/storage/quota";

type WeddingRow = {
  id: string;
  slug: string;
  studio_code: string;
  plan: WeddingPlan;
  storage_quota_bytes: number;
  storage_used_bytes: number;
  access_anchor_date: string | null;
  access_expires_at: string | null;
  cleanup_after: string | null;
  bride_name: string;
  groom_name: string;
  couple_name: string;
  event_date: string | null;
  welcome_note: string;
  upload_locked: boolean;
  demo: boolean;
  realtime_topic: string;
  profile_media_id: string | null;
  profile_media_path: string | null;
  profile_media_kind: "image" | "video" | "audio" | null;
  profile_media_mime_type: string | null;
  profile_media_file_name: string | null;
  profile_media_byte_size: number | null;
  profile_media_created_at: string | null;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: string;
  wedding_id: string;
  storage_path: string;
  kind: "image" | "video" | "audio";
  mime_type: string;
  file_name: string;
  byte_size: number;
  thumbnail_id: string | null;
  thumbnail_path: string | null;
  thumbnail_mime_type: string | null;
  thumbnail_file_name: string | null;
  thumbnail_byte_size: number | null;
  thumbnail_created_at: string | null;
  guest_name: string;
  note: string | null;
  approved: boolean;
  hidden: boolean;
  favorite: boolean;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  wedding_id: string;
  created_at: string;
  expires_at: string;
};

function tokenFromRow(row: {
  id: string;
  token_hash: string;
  status: "unused" | "active" | "revoked";
  wedding_id: string | null;
  created_at: string;
  activated_at: string | null;
}): TokenRecord {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    status: row.status,
    weddingId: row.wedding_id ?? undefined,
    createdAt: row.created_at,
    activatedAt: row.activated_at ?? undefined,
  };
}

async function profileMediaFromWeddingRow(row: WeddingRow): Promise<StoredMediaObject | undefined> {
  if (
    !row.profile_media_id ||
    !row.profile_media_path ||
    !row.profile_media_kind ||
    !row.profile_media_mime_type ||
    !row.profile_media_file_name ||
    row.profile_media_byte_size === null ||
    !row.profile_media_created_at
  ) {
    return undefined;
  }

  return {
    id: row.profile_media_id,
    storagePath: row.profile_media_path,
    url: await createSignedStorageUrl(row.profile_media_path),
    kind: row.profile_media_kind,
    mimeType: row.profile_media_mime_type,
    fileName: row.profile_media_file_name,
    byteSize: row.profile_media_byte_size,
    createdAt: row.profile_media_created_at,
  };
}

async function weddingFromRow(row: WeddingRow): Promise<Wedding> {
  return {
    id: row.id,
    slug: row.slug,
    studioCode: row.studio_code,
    plan: row.plan,
    storageQuotaBytes: row.storage_quota_bytes,
    storageUsedBytes: row.storage_used_bytes,
    accessAnchorDate: row.access_anchor_date ?? undefined,
    accessExpiresAt: row.access_expires_at ?? undefined,
    cleanupAfter: row.cleanup_after ?? undefined,
    brideName: row.bride_name,
    groomName: row.groom_name,
    coupleName: row.couple_name,
    realtimeTopic: row.realtime_topic,
    demo: row.demo,
    eventDate: row.event_date ?? undefined,
    welcomeNote: row.welcome_note,
    profileMedia: await profileMediaFromWeddingRow(row),
    uploadLocked: row.upload_locked,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicWedding(wedding: Wedding): PublicWedding {
  return {
    id: wedding.id,
    slug: wedding.slug,
    plan: wedding.plan,
    storageQuotaBytes: wedding.storageQuotaBytes,
    storageUsedBytes: wedding.storageUsedBytes,
    accessAnchorDate: wedding.accessAnchorDate,
    accessExpiresAt: wedding.accessExpiresAt,
    cleanupAfter: wedding.cleanupAfter,
    brideName: wedding.brideName,
    groomName: wedding.groomName,
    coupleName: wedding.coupleName,
    eventDate: wedding.eventDate,
    welcomeNote: wedding.welcomeNote,
    profileMedia: wedding.profileMedia,
    uploadLocked: wedding.uploadLocked,
  };
}

async function mediaFromRow(row: MediaRow): Promise<WeddingMedia> {
  const thumbnail =
    row.thumbnail_id &&
    row.thumbnail_path &&
    row.thumbnail_mime_type &&
    row.thumbnail_file_name &&
    row.thumbnail_byte_size !== null &&
    row.thumbnail_created_at
      ? {
          id: row.thumbnail_id,
          storagePath: row.thumbnail_path,
          url: await createSignedStorageUrl(row.thumbnail_path),
          kind: "image" as const,
          mimeType: row.thumbnail_mime_type,
          fileName: row.thumbnail_file_name,
          byteSize: row.thumbnail_byte_size,
          createdAt: row.thumbnail_created_at,
        }
      : undefined;

  return {
    id: row.id,
    weddingId: row.wedding_id,
    storagePath: row.storage_path,
    url: await createSignedStorageUrl(row.storage_path),
    kind: row.kind,
    mimeType: row.mime_type,
    fileName: row.file_name,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    guestName: row.guest_name,
    note: row.note ?? undefined,
    thumbnail,
    approved: row.approved,
    hidden: row.hidden,
    favorite: row.favorite,
  };
}

function sessionFromRow(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    weddingId: row.wedding_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

async function makeUniqueSlug(baseSlug: string) {
  const supabase = getSupabaseAdmin();
  let candidate = baseSlug;
  let index = 2;

  while (true) {
    const { data, error } = await supabase
      .from("weddings")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return candidate;
    }

    candidate = `${baseSlug}-${index}`;
    index += 1;
  }
}

async function makeUniqueStudioCode() {
  const supabase = getSupabaseAdmin();

  while (true) {
    const candidate = createStudioCode();
    const { data, error } = await supabase
      .from("weddings")
      .select("id")
      .eq("studio_code", candidate)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return candidate;
    }
  }
}

function normalizeNameForMatch(name: string) {
  return name.trim().toLowerCase();
}

export async function activateWedding(input: {
  brideName: string;
  groomName: string;
  token: string;
}) {
  const supabase = getSupabaseAdmin();
  const brideName = input.brideName.trim();
  const groomName = input.groomName.trim();

  if (!brideName || !groomName) {
    return { ok: false as const, message: "Add both names so we can open the right studio." };
  }

  const tokenHash = hashToken(input.token);
  const { data: tokenRow, error: tokenError } = await supabase
    .from("tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  const token = tokenRow ? tokenFromRow(tokenRow) : null;

  if (!token || token.status === "revoked") {
    return { ok: false as const, message: "That token does not look right. Check your Etsy email and try again." };
  }

  if (token.status === "active") {
    if (!token.weddingId) {
      return { ok: false as const, message: "That token is active, but its studio could not be found." };
    }

    const existingWedding = await getWeddingById(token.weddingId);

    if (!existingWedding) {
      return { ok: false as const, message: "That token is active, but its studio could not be found." };
    }

    const sameCouple =
      normalizeNameForMatch(existingWedding.brideName) === normalizeNameForMatch(brideName) &&
      normalizeNameForMatch(existingWedding.groomName) === normalizeNameForMatch(groomName);

    if (!sameCouple) {
      return {
        ok: false as const,
        message: "This token already opens another studio. Use the same names you entered the first time.",
      };
    }

    return { ok: true as const, wedding: existingWedding };
  }

  if (token.status !== "unused") {
    return { ok: false as const, message: "That token cannot open a studio right now." };
  }

  const now = new Date().toISOString();
  const weddingId = createId("wed");
  const slug = await makeUniqueSlug(makeBaseWeddingSlug(brideName, groomName));
  const studioCode = await makeUniqueStudioCode();
  const accessWindow = buildActivationFallbackWindow(new Date(now));
  const { data: weddingRow, error: weddingError } = await supabase
    .from("weddings")
    .insert({
      id: weddingId,
      slug,
      studio_code: studioCode,
      plan: "classic",
      storage_quota_bytes: CLASSIC_STORAGE_BYTES,
      storage_used_bytes: 0,
      access_anchor_date: accessWindow.accessAnchorDate,
      access_expires_at: accessWindow.accessExpiresAt,
      cleanup_after: accessWindow.cleanupAfter,
      bride_name: brideName,
      groom_name: groomName,
      couple_name: makeCoupleName(brideName, groomName),
      welcome_note:
        "Tonight, every photo, voice note, and tiny moment becomes part of our story.",
      upload_locked: false,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (weddingError) {
    throw new Error(weddingError.message);
  }

  const { error: updateTokenError } = await supabase
    .from("tokens")
    .update({
      status: "active",
      wedding_id: weddingId,
      activated_at: now,
    })
    .eq("id", token.id)
    .eq("status", "unused");

  if (updateTokenError) {
    throw new Error(updateTokenError.message);
  }

  return { ok: true as const, wedding: await weddingFromRow(weddingRow) };
}

export async function createSession(weddingId: string) {
  const supabase = getSupabaseAdmin();
  const now = new Date();
  const session = {
    id: createId("sess"),
    wedding_id: weddingId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  };
  const { data, error } = await supabase.from("sessions").insert(session).select("*").single();

  if (error) {
    throw new Error(error.message);
  }

  return sessionFromRow(data);
}

export async function getSession(sessionId?: string) {
  if (!sessionId) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? sessionFromRow(data) : null;
}

export async function deleteSession(sessionId?: string) {
  if (!sessionId) {
    return;
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("sessions").delete().eq("id", sessionId);
}

export async function getWeddingById(weddingId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .eq("id", weddingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? weddingFromRow(data) : null;
}

export async function getWeddingByStudioCode(studioCode: string) {
  const supabase = getSupabaseAdmin();
  const normalizedCode = studioCode.trim().toUpperCase();

  if (!normalizedCode) {
    return null;
  }

  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .eq("studio_code", normalizedCode)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? weddingFromRow(data) : null;
}

export async function listUpgradeLogs(weddingId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("upgrade_logs")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function applyPremiumExtension(input: {
  studioCode: string;
  etsyOrderNumber: string;
  note?: string;
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("apply_premium_extension", {
    p_studio_code: input.studioCode,
    p_etsy_order_number: input.etsyOrderNumber,
    p_note: input.note ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Premium extension could not be applied.");
  }

  return weddingFromRow(data);
}

export async function getWeddingBySlug(slug: string): Promise<PublicWedding | null> {
  const wedding = await getWeddingRecordBySlug(slug);
  return wedding ? publicWedding(wedding) : null;
}

export async function getWeddingRecordBySlug(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? weddingFromRow(data) : null;
}

export async function getDemoWeddingBySlug(slug: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .eq("slug", slug)
    .eq("demo", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? weddingFromRow(data) : null;
}

export async function updateWedding(
  weddingId: string,
  patch: Partial<Pick<Wedding, "brideName" | "groomName" | "eventDate" | "welcomeNote" | "uploadLocked">> & {
    profileMedia?: StoredMediaObject;
  },
) {
  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {};
  const { data: existingRow, error: existingError } = await supabase
    .from("weddings")
    .select("*")
    .eq("id", weddingId)
    .single();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (patch.brideName !== undefined || patch.groomName !== undefined) {
    const brideName = patch.brideName?.trim();
    const groomName = patch.groomName?.trim();

    if (!brideName || !groomName) {
      throw new Error("Both names are required.");
    }

    update.bride_name = brideName;
    update.groom_name = groomName;
    update.couple_name = makeCoupleName(brideName, groomName);
  }

  if ("eventDate" in patch) {
    const nextEventDate = patch.eventDate || null;
    update.event_date = nextEventDate;

    if (!existingRow.event_date && nextEventDate) {
      const accessMonths =
        existingRow.plan === "premium"
          ? CLASSIC_ACCESS_MONTHS + PREMIUM_EXTENSION_MONTHS
          : CLASSIC_ACCESS_MONTHS;
      const accessWindow = buildAccessWindow(nextEventDate, accessMonths);
      update.access_anchor_date = accessWindow.accessAnchorDate;
      update.access_expires_at = accessWindow.accessExpiresAt;
      update.cleanup_after = accessWindow.cleanupAfter;
    }
  }

  if ("welcomeNote" in patch && patch.welcomeNote !== undefined) {
    update.welcome_note = patch.welcomeNote;
  }

  if ("uploadLocked" in patch && patch.uploadLocked !== undefined) {
    update.upload_locked = patch.uploadLocked;
  }

  if (patch.profileMedia) {
    update.profile_media_id = patch.profileMedia.id;
    update.profile_media_path = patch.profileMedia.storagePath;
    update.profile_media_kind = patch.profileMedia.kind;
    update.profile_media_mime_type = patch.profileMedia.mimeType;
    update.profile_media_file_name = patch.profileMedia.fileName;
    update.profile_media_byte_size = patch.profileMedia.byteSize;
    update.profile_media_created_at = patch.profileMedia.createdAt;
  }

  const { data, error } = await supabase
    .from("weddings")
    .update(update)
    .eq("id", weddingId)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return weddingFromRow(data);
}

export async function listWeddingMedia(weddingId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_media")
    .select("*")
    .eq("wedding_id", weddingId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return Promise.all((data ?? []).map((row) => mediaFromRow(row)));
}

export async function getWeddingMediaById(mediaId: string, weddingId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_media")
    .select("*")
    .eq("id", mediaId)
    .eq("wedding_id", weddingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mediaFromRow(data) : null;
}

export async function addWeddingMedia(input: {
  weddingId: string;
  guestName: string;
  note?: string;
  object: StoredMediaObject;
  thumbnail?: StoredMediaObject;
}) {
  if (!input.object.storagePath) {
    throw new Error("Stored media is missing its storage path.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("add_wedding_media_with_quota", {
    p_id: input.object.id,
    p_wedding_id: input.weddingId,
    p_storage_path: input.object.storagePath,
    p_kind: input.object.kind,
    p_mime_type: input.object.mimeType,
    p_file_name: input.object.fileName,
    p_byte_size: input.object.byteSize,
    p_thumbnail_id: input.thumbnail?.id ?? null,
    p_thumbnail_path: input.thumbnail?.storagePath ?? null,
    p_thumbnail_mime_type: input.thumbnail?.mimeType ?? null,
    p_thumbnail_file_name: input.thumbnail?.fileName ?? null,
    p_thumbnail_byte_size: input.thumbnail?.byteSize ?? null,
    p_thumbnail_created_at: input.thumbnail?.createdAt ?? null,
    p_guest_name: input.guestName,
    p_note: input.note ?? null,
    p_created_at: input.object.createdAt,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Media could not be saved.");
  }

  return mediaFromRow(data);
}

export async function updateMediaForWedding(
  mediaId: string,
  weddingId: string,
  patch: Partial<Pick<WeddingMedia, "approved" | "hidden" | "favorite">>,
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_media")
    .update(patch)
    .eq("id", mediaId)
    .eq("wedding_id", weddingId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mediaFromRow(data);
}

export async function deleteMedia(mediaId: string, weddingId: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("wedding_media")
    .select("*")
    .eq("id", mediaId)
    .eq("wedding_id", weddingId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    return false;
  }

  await deleteStoredFile(existing.storage_path);
  await deleteStoredFile(existing.thumbnail_path);

  const { error } = await supabase
    .from("wedding_media")
    .delete()
    .eq("id", mediaId)
    .eq("wedding_id", weddingId);

  if (error) {
    throw new Error(error.message);
  }

  const { error: updateWeddingError } = await supabase.rpc("decrement_wedding_storage_usage", {
    p_wedding_id: weddingId,
    p_byte_size: existing.byte_size,
  });

  if (updateWeddingError) {
    throw new Error(updateWeddingError.message);
  }

  return true;
}
