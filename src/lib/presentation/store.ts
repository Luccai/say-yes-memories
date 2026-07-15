import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  PRESENTATION_MEDIA_KINDS,
  PRESENTATION_PAGE_SIZE,
  presentationContentUrl,
} from "@/lib/presentation/domain";
import { encodePresentationCursor } from "@/lib/presentation/cursor";
import type {
  PresentationCursor,
  PresentationMediaItem,
  PresentationMediaPage,
} from "@/lib/presentation/types";

type PresentationMediaRow = {
  id: string;
  kind: "image" | "video" | "audio";
  mime_type: string;
  file_name: string;
  byte_size: number;
  created_at: string;
  guest_name: string;
  note: string | null;
};

const PRESENTATION_MEDIA_COLUMNS =
  "id,kind,mime_type,file_name,byte_size,created_at,guest_name,note";

function presentationMediaFromRow(row: PresentationMediaRow): PresentationMediaItem {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    fileName: row.file_name,
    byteSize: Number(row.byte_size),
    createdAt: row.created_at,
    guestName: row.guest_name,
    note: row.note ?? undefined,
    contentUrl: presentationContentUrl(row.id),
  };
}

export async function listPresentationMediaPage(
  weddingId: string,
  options: { after?: PresentationCursor } = {},
): Promise<PresentationMediaPage> {
  const supabase = getSupabaseAdmin();
  let pageQuery = supabase
    .from("wedding_media")
    .select(PRESENTATION_MEDIA_COLUMNS)
    .eq("wedding_id", weddingId)
    .in("kind", PRESENTATION_MEDIA_KINDS)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PRESENTATION_PAGE_SIZE + 1);

  if (options.after) {
    const { createdAt, id } = options.after;
    pageQuery = pageQuery.or(
      `created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`,
    );
  }

  const [pageResult, countResult] = await Promise.all([
    pageQuery,
    supabase
      .from("wedding_media")
      .select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId)
      .in("kind", PRESENTATION_MEDIA_KINDS),
  ]);

  if (pageResult.error) {
    throw new Error(pageResult.error.message);
  }
  if (countResult.error) {
    throw new Error(countResult.error.message);
  }

  const rows = (pageResult.data ?? []) as PresentationMediaRow[];
  const hasMore = rows.length > PRESENTATION_PAGE_SIZE;
  const visibleRows = rows.slice(0, PRESENTATION_PAGE_SIZE);
  const lastRow = visibleRows.at(-1);

  return {
    media: visibleRows.map(presentationMediaFromRow),
    total: countResult.count ?? visibleRows.length,
    hasMore,
    nextCursor:
      hasMore && lastRow
        ? encodePresentationCursor({
            createdAt: lastRow.created_at,
            id: lastRow.id,
          })
        : null,
  };
}

export async function getPresentationMediaSource(mediaId: string, weddingId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("wedding_media")
    .select("storage_path")
    .eq("id", mediaId)
    .eq("wedding_id", weddingId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.storage_path
    ? { storagePath: String(data.storage_path) }
    : null;
}
