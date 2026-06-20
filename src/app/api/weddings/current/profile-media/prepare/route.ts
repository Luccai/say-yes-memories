import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { createSignedUploadTarget } from "@/lib/storage/storage-service";

type PrepareProfileUploadBody = {
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
};

export async function POST(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const body = (await request.json()) as PrepareProfileUploadBody;

  try {
    const upload = await createSignedUploadTarget(
      {
        name: String(body.fileName ?? "profile-media"),
        type: String(body.mimeType ?? "application/octet-stream"),
        size: Number(body.byteSize ?? 0),
      },
      { weddingId: current.wedding.id, folder: "profile", allowedKinds: ["image", "video"] },
    );

    return NextResponse.json({ upload });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not prepare profile upload." },
      { status: 400 },
    );
  }
}
