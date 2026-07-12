import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { getPresentationMediaSource } from "@/lib/presentation/store";
import { createSignedStorageUrl } from "@/lib/storage/storage-service";

const MEDIA_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const PRESENTATION_CONTENT_TTL_SECONDS = 60 * 60 * 6;

type PresentationContentRouteDependencies = {
  getCurrentWeddingFromCookie: () => Promise<{
    wedding: {
      id: string;
      profileMedia?: { id: string; storagePath?: string };
    };
  } | null>;
  getPresentationMediaSource: (
    mediaId: string,
    weddingId: string,
  ) => Promise<{ storagePath: string } | null>;
  createSignedStorageUrl: (
    storagePath: string,
    expiresIn?: number,
  ) => Promise<string>;
};

export function createPresentationContentGet(
  dependencies: PresentationContentRouteDependencies,
) {
  return async function presentationContentGet(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const current = await dependencies.getCurrentWeddingFromCookie();
    if (!current) {
      return NextResponse.json({ message: "Session not found." }, { status: 401 });
    }

    const { id } = await context.params;
    if (!MEDIA_ID_PATTERN.test(id)) {
      return NextResponse.json({ message: "Media not found." }, { status: 404 });
    }

    try {
      const profileMedia = current.wedding.profileMedia;
      const source =
        profileMedia?.id === id && profileMedia.storagePath
          ? { storagePath: profileMedia.storagePath }
          : await dependencies.getPresentationMediaSource(id, current.wedding.id);

      if (!source) {
        return NextResponse.json({ message: "Media not found." }, { status: 404 });
      }

      const signedUrl = await dependencies.createSignedStorageUrl(
        source.storagePath,
        PRESENTATION_CONTENT_TTL_SECONDS,
      );
      return NextResponse.redirect(signedUrl, {
        status: 307,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
          Vary: "Cookie",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return NextResponse.json(
        { message: "Media could not be prepared." },
        { status: 500 },
      );
    }
  };
}

export const GET = createPresentationContentGet({
  getCurrentWeddingFromCookie,
  getPresentationMediaSource,
  createSignedStorageUrl,
});
