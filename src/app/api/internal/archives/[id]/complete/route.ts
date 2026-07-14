import { NextResponse } from "next/server";
import { archiveObjectPath, archiveOutputMatches } from "@/lib/archives/domain";
import {
  ArchiveRequestAuthorizationError,
  nonNegativeSafeInteger,
  parseArchiveJson,
  readAuthorizedArchiveRequest,
} from "@/lib/archives/internal-auth";
import { completeArchiveJob, getArchiveManifest } from "@/lib/archives/store";
import { headR2Object } from "@/lib/storage/storage-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const authorized = await readAuthorizedArchiveRequest(request, id);
    const body = parseArchiveJson(authorized.body);
    const manifest = await getArchiveManifest(id);
    if (!manifest?.job.archiveFileName) {
      return NextResponse.json({ message: "Archive job was not found." }, { status: 404 });
    }
    const archivePath = archiveObjectPath({
      weddingId: manifest.job.weddingId,
      jobId: manifest.job.id,
      attemptId: authorized.attemptId,
      fileName: manifest.job.archiveFileName,
    });
    if (body.archivePath !== archivePath || body.archiveFileName !== manifest.job.archiveFileName) {
      return NextResponse.json({ message: "Archive output was rejected." }, { status: 400 });
    }
    const archiveByteSize = nonNegativeSafeInteger(body.archiveByteSize, "archiveByteSize");
    const storedObject = await headR2Object(archivePath);
    if (!archiveOutputMatches({ expectedBytes: archiveByteSize, ...storedObject })) {
      return NextResponse.json({ message: "Archive output was rejected." }, { status: 400 });
    }
    const job = await completeArchiveJob({
      jobId: id,
      attemptId: authorized.attemptId,
      archivePath,
      archiveFileName: manifest.job.archiveFileName,
      archiveByteSize,
    });
    return NextResponse.json({ status: job.status, expiresAt: job.expiresAt });
  } catch (error) {
    if (error instanceof ArchiveRequestAuthorizationError) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ message: "Archive completion was rejected." }, { status: 400 });
  }
}
