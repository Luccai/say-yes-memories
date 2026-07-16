import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { getWeddingMediaById } from "@/lib/supabase-store";
import { createSignedStorageUrl } from "@/lib/storage/storage-service";
import { safeDownloadFileName } from "@/lib/uploads/domain";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const { id } = await context.params;
  const media = await getWeddingMediaById(id, current.wedding.id);

  if (!media?.storagePath) {
    return NextResponse.json({ message: "Media not found." }, { status: 404 });
  }

  try {
    const url = await createSignedStorageUrl(
      media.storagePath,
      10 * 60,
      safeDownloadFileName(media.fileName, media.mimeType),
    );
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json(
      { message: "Download could not be prepared." },
      { status: 500 },
    );
  }
}
