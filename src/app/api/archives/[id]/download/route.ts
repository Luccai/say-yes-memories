import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { getArchiveJobForWedding } from "@/lib/archives/store";
import { createSignedStorageUrl } from "@/lib/storage/storage-service";

export const dynamic = "force-dynamic";

type ArchiveDownloadDependencies = {
  getCurrentWeddingFromCookie: typeof getCurrentWeddingFromCookie;
  getArchiveJobForWedding: typeof getArchiveJobForWedding;
  createSignedStorageUrl: typeof createSignedStorageUrl;
};

const defaultDependencies: ArchiveDownloadDependencies = {
  getCurrentWeddingFromCookie,
  getArchiveJobForWedding,
  createSignedStorageUrl,
};

export function createArchiveDownloadGet(
  dependencies: ArchiveDownloadDependencies = defaultDependencies,
) {
  return async function GET(
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) {
    const current = await dependencies.getCurrentWeddingFromCookie();
    if (!current) {
      return NextResponse.json({ message: "Session not found." }, { status: 401 });
    }

    const { id } = await context.params;
    const archive = await dependencies.getArchiveJobForWedding(id, current.wedding.id);
    const now = Date.now();
    const expiresAt = archive?.expiresAt ? new Date(archive.expiresAt).getTime() : Number.NaN;
    if (
      !archive ||
      archive.status !== "ready" ||
      !archive.archivePath ||
      !archive.archiveFileName ||
      !archive.expiresAt ||
      !Number.isFinite(expiresAt) || expiresAt <= now
    ) {
      return NextResponse.json(
        { message: "Archive is not available." },
        { status: 404 },
      );
    }

    try {
      const signedSeconds = Math.max(1, Math.min(10 * 60, Math.floor((expiresAt - now) / 1000)));
      const url = await dependencies.createSignedStorageUrl(
        archive.archivePath,
        signedSeconds,
        archive.archiveFileName,
      );
      return NextResponse.redirect(url, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return NextResponse.json(
        { message: "Archive download could not be prepared." },
        { status: 503 },
      );
    }
  };
}

export const GET = createArchiveDownloadGet();
