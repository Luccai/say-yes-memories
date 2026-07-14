import { NextResponse } from "next/server";
import { readAuthorizedArchiveRequest, ArchiveRequestAuthorizationError } from "@/lib/archives/internal-auth";
import { archiveObjectPath } from "@/lib/archives/domain";
import { getArchiveManifest, markArchiveJobRunning } from "@/lib/archives/store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { attemptId } = await readAuthorizedArchiveRequest(request, id);
    const job = await markArchiveJobRunning(id, attemptId);
    if (!job.active || !job.archiveFileName) {
      return NextResponse.json({ message: "Archive job was not found." }, { status: 404 });
    }
    const manifest = await getArchiveManifest(id);
    if (!manifest) {
      return NextResponse.json({ message: "Archive job was not found." }, { status: 404 });
    }
    const archiveFileName = job.archiveFileName;
    if (!archiveFileName) {
      return NextResponse.json({ message: "Archive job was not found." }, { status: 404 });
    }
    return NextResponse.json({
      job: {
        id: job.id,
        weddingId: job.weddingId,
        sourceMediaCount: job.sourceMediaCount,
        sourceTotalBytes: job.sourceTotalBytes,
        archiveFileName,
        archivePath: archiveObjectPath({
          weddingId: job.weddingId,
          jobId: job.id,
          attemptId,
          fileName: archiveFileName,
        }),
      },
      items: manifest.items,
    });
  } catch (error) {
    if (error instanceof ArchiveRequestAuthorizationError) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Archive manifest failed." },
      { status: 400 },
    );
  }
}
