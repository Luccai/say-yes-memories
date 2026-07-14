import { NextResponse } from "next/server";
import {
  ArchiveRequestAuthorizationError,
  parseArchiveJson,
  readAuthorizedArchiveRequest,
} from "@/lib/archives/internal-auth";
import { failArchiveJob } from "@/lib/archives/store";

export const dynamic = "force-dynamic";

function failureCode(value: unknown) {
  return typeof value === "string" && /^[A-Z0-9_]{3,80}$/.test(value)
    ? value
    : "ARCHIVE_FAILED";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const authorized = await readAuthorizedArchiveRequest(request, id);
    const body = parseArchiveJson(authorized.body);
    const job = await failArchiveJob({
      jobId: id,
      attemptId: authorized.attemptId,
      errorCode: failureCode(body.errorCode),
      errorDetail:
        typeof body.errorDetail === "string" ? body.errorDetail.slice(0, 1000) : undefined,
    });
    return NextResponse.json({ status: job.status });
  } catch (error) {
    if (error instanceof ArchiveRequestAuthorizationError) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ message: "Archive failure was rejected." }, { status: 400 });
  }
}
