import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { getWeddingMediaById } from "@/lib/supabase-store";
import { createSignedStorageUrl } from "@/lib/storage/storage-service";

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
    const url = await createSignedStorageUrl(media.storagePath, 10 * 60, media.fileName);
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Download could not be prepared." },
      { status: 500 },
    );
  }
}
