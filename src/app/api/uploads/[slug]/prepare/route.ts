import { NextResponse } from "next/server";
import { getWeddingBySlug } from "@/lib/supabase-store";
import {
  createSignedUploadTarget,
  MAX_THUMBNAIL_UPLOAD_BYTES,
} from "@/lib/storage/storage-service";
import { canAcceptGuestUpload, isAccessExpired } from "@/lib/storage/quota";

type PrepareUploadBody = {
  guestName?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  thumbnail?: {
    fileName?: string;
    mimeType?: string;
    byteSize?: number;
  };
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const wedding = await getWeddingBySlug(slug);

  if (!wedding) {
    return NextResponse.json({ message: "Wedding page not found." }, { status: 404 });
  }

  if (wedding.uploadLocked) {
    return NextResponse.json({ message: "Guest uploads are currently closed." }, { status: 403 });
  }

  const body = (await request.json()) as PrepareUploadBody;
  const guestName = String(body.guestName ?? "").trim();

  if (!guestName) {
    return NextResponse.json({ message: "Your name is required." }, { status: 400 });
  }

  const byteSize = Number(body.byteSize ?? 0);

  if (isAccessExpired(wedding)) {
    return NextResponse.json({ message: "Gallery access has expired." }, { status: 403 });
  }

  if (!canAcceptGuestUpload(wedding, byteSize)) {
    return NextResponse.json(
      { message: "Storage is full. The couple needs to upgrade before more uploads can be added." },
      { status: 403 },
    );
  }

  try {
    const upload = await createSignedUploadTarget(
      {
        name: String(body.fileName ?? "upload"),
        type: String(body.mimeType ?? "application/octet-stream"),
        size: byteSize,
      },
      { weddingId: wedding.id, folder: "guest" },
    );
    const thumbnailUpload = body.thumbnail
      ? await createSignedUploadTarget(
          {
            name: String(body.thumbnail.fileName ?? "memory-thumbnail.jpg"),
            type: String(body.thumbnail.mimeType ?? "image/jpeg"),
            size: Number(body.thumbnail.byteSize ?? 0),
          },
          {
            weddingId: wedding.id,
            folder: "guest-thumbnail",
            allowedKinds: ["image"],
            maxBytes: MAX_THUMBNAIL_UPLOAD_BYTES,
          },
        )
      : undefined;

    return NextResponse.json({ upload, thumbnailUpload });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not prepare upload." },
      { status: 400 },
    );
  }
}
