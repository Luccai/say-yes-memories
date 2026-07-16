import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { createProfileSignedUploadTarget } from "@/lib/storage/storage-service";

type PrepareProfileUploadBody = {
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
};

const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;

export async function POST(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const body = (await request.json()) as PrepareProfileUploadBody;
  const byteSize = Number(body.byteSize ?? 0);

  if (byteSize > PROFILE_PHOTO_MAX_BYTES) {
    return NextResponse.json(
      { message: "Profile photos must be 500 KB or smaller." },
      { status: 400 },
    );
  }

  try {
    const upload = await createProfileSignedUploadTarget(
      {
        name: String(body.fileName ?? "profile-media"),
        type: String(body.mimeType ?? "application/octet-stream"),
        size: byteSize,
      },
      {
        weddingId: current.wedding.id,
        allowedKinds: ["image"],
        maxBytes: PROFILE_PHOTO_MAX_BYTES,
      },
    );

    return NextResponse.json({ upload });
  } catch (error) {
    const message =
      error instanceof Error &&
      (error.message.includes("accepted") ||
        error.message.includes("empty") ||
        error.message.includes("extension"))
        ? error.message
        : "Could not prepare profile upload. Please try again.";
    return NextResponse.json(
      { message },
      { status: 400 },
    );
  }
}
