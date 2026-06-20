import type {
  PublicWedding,
  SessionRecord,
  StoredMediaObject,
  TokenRecord,
  Wedding,
  WeddingMedia,
} from "@/lib/types";
import { createId, hashToken, SESSION_MAX_AGE_SECONDS } from "@/lib/security";
import { makeBaseWeddingSlug, makeCoupleName } from "@/lib/text";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSignedStorageUrl, deleteStoredFile } from "@/lib/storage/storage-service";

type WeddingRow = {
  id: string;
  slug: string;
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

export async function activateWedding(input: {
  brideName: string;
  groomName: string;
  token: string;
}) {
  const supabase = getSupabaseAdmin();
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

  if (!token || token.status !== "unused") {
    return { ok: false as const, message: "Invalid or already used token." };
  }

  const brideName = input.brideName.trim();
  const groomName = input.groomName.trim();

  if (!brideName || !groomName) {
    return { ok: false as const, message: "Bride and groom names are required." };
  }

  const now = new Date().toISOString();
  const weddingId = createId("wed");
  const slug = await makeUniqueSlug(makeBaseWeddingSlug(brideName, groomName));
  const { data: weddingRow, error: weddingError } = await supabase
    .from("weddings")
    .insert({
      id: weddingId,
      slug,
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

export async function getWeddingBySlug(slug: string): Promise<PublicWedding | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("weddings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? publicWedding(await weddingFromRow(data)) : null;
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
  patch: Partial<Pick<Wedding, "eventDate" | "welcomeNote" | "uploadLocked">> & {
    profileMedia?: StoredMediaObject;
  },
) {
  const supabase = getSupabaseAdmin();
  const update: Record<string, unknown> = {};

  if ("eventDate" in patch) {
    update.event_date = patch.eventDate || null;
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

export async function addWeddingMedia(input: {
  weddingId: string;
  guestName: string;
  note?: string;
  object: StoredMediaObject;
}) {
  if (!input.object.storagePath) {
    throw new Error("Stored media is missing its storage path.");
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wedding_media")
    .insert({
      id: input.object.id,
      wedding_id: input.weddingId,
      storage_path: input.object.storagePath,
      kind: input.object.kind,
      mime_type: input.object.mimeType,
      file_name: input.object.fileName,
      byte_size: input.object.byteSize,
      guest_name: input.guestName,
      note: input.note,
      approved: true,
      hidden: false,
      favorite: false,
      created_at: input.object.createdAt,
      updated_at: input.object.createdAt,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const media = await mediaFromRow(data);
  await broadcastWeddingMedia(input.weddingId, "media-created", media);
  return media;
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

  const media = await mediaFromRow(data);
  await broadcastWeddingMedia(weddingId, "media-updated", media);
  return media;
}

export async function deleteMedia(mediaId: string, weddingId: string) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("wedding_media")
    .select("storage_path")
    .eq("id", mediaId)
    .eq("wedding_id", weddingId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (!existing) {
    return false;
  }

  const { error } = await supabase
    .from("wedding_media")
    .delete()
    .eq("id", mediaId)
    .eq("wedding_id", weddingId);

  if (error) {
    throw new Error(error.message);
  }

  await deleteStoredFile(existing.storage_path);
  await broadcastWeddingMedia(weddingId, "media-deleted", { id: mediaId });
  return true;
}

export async function broadcastWeddingMedia(
  weddingId: string,
  event: string,
  payload: unknown,
) {
  const wedding = await getWeddingById(weddingId);

  if (!wedding?.realtimeTopic) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const channel = supabase.channel(`wedding:${wedding.realtimeTopic}`);
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        resolve();
      }
    });
    setTimeout(() => resolve(), 1200);
  });

  await channel.send({
    type: "broadcast",
    event,
    payload,
  });
  await supabase.removeChannel(channel);
}
