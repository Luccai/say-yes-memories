import { NextResponse } from "next/server";
import {
  ArchiveRequestAuthorizationError,
  nonNegativeSafeInteger,
  parseArchiveJson,
  readAuthorizedArchiveRequest,
} from "@/lib/archives/internal-auth";
import { updateArchiveJobProgress } from "@/lib/archives/store";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const authorized = await readAuthorizedArchiveRequest(request, id);
    const body = parseArchiveJson(authorized.body);
    const job = await updateArchiveJobProgress({
      jobId: id,
      attemptId: authorized.attemptId,
      preparedMediaCount: nonNegativeSafeInteger(body.preparedMediaCount, "preparedMediaCount"),
      preparedSourceBytes: nonNegativeSafeInteger(body.preparedSourceBytes, "preparedSourceBytes"),
    });
    return NextResponse.json({ status: job.status });
  } catch (error) {
    if (error instanceof ArchiveRequestAuthorizationError) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ message: "Archive progress was rejected." }, { status: 400 });
  }
}
