import { NextResponse } from "next/server";
import {
  ArchiveRequestAuthorizationError,
  readAuthorizedArchiveRequest,
} from "@/lib/archives/internal-auth";
import { markArchiveJobRunning } from "@/lib/archives/store";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { attemptId } = await readAuthorizedArchiveRequest(request, id);
    const job = await markArchiveJobRunning(id, attemptId);
    return NextResponse.json({ status: job.status });
  } catch (error) {
    if (error instanceof ArchiveRequestAuthorizationError) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    return NextResponse.json({ message: "Archive attempt was rejected." }, { status: 409 });
  }
}
