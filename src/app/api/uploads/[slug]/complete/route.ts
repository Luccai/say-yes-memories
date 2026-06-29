import { NextResponse } from "next/server";
import type { StoredMediaObject } from "@/lib/types";
import { addWeddingMedia, getWeddingRecordBySlug } from "@/lib/supabase-store";
import {
  assertUploadBelongsToWedding,
  deleteStoredFile,
  finalizeSignedUpload,
  MAX_THUMBNAIL_UPLOAD_BYTES,
  type PendingStoredMediaObject,
} from "@/lib/storage/storage-service";
import { isAccessExpired } from "@/lib/storage/quota";
import { broadcastWeddingMediaChange } from "@/lib/supabase/realtime";

type CompleteUploadBody = {
  guestName?: string;
  note?: string;
  object?: PendingStoredMediaObject;
  thumbnail?: PendingStoredMediaObject;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const wedding = await getWeddingRecordBySlug(slug);

  if (!wedding) {
    return NextResponse.json({ message: "Wedding page not found." }, { status: 404 });
  }

  if (wedding.uploadLocked) {
    return NextResponse.json({ message: "Guest uploads are currently closed." }, { status: 403 });
  }

  if (isAccessExpired(wedding)) {
    return NextResponse.json({ message: "Gallery access has expired." }, { status: 403 });
  }

  const body = (await request.json()) as CompleteUploadBody;
  const guestName = String(body.guestName ?? "").trim();
  const note = String(body.note ?? "").trim();

  if (!guestName) {
    return NextResponse.json({ message: "Your name is required." }, { status: 400 });
  }

  if (!body.object) {
    return NextResponse.json({ message: "Upload metadata is missing." }, { status: 400 });
  }

  try {
    assertUploadBelongsToWedding(body.object, { weddingId: wedding.id, folder: "guest" });
    const object = await finalizeSignedUpload(body.object);
    let thumbnail: StoredMediaObject | undefined;

    if (body.thumbnail && object.kind !== "audio") {
      assertUploadBelongsToWedding(body.thumbnail, {
        weddingId: wedding.id,
        folder: "guest-thumbnail",
        allowedKinds: ["image"],
        maxBytes: MAX_THUMBNAIL_UPLOAD_BYTES,
      });
      thumbnail = await finalizeSignedUpload(body.thumbnail);
    }

    const media = await addWeddingMedia({
      weddingId: wedding.id,
      guestName,
      note: note || undefined,
      object,
      thumbnail,
    });
    await broadcastWeddingMediaChange(wedding.realtimeTopic);

    return NextResponse.json({ media });
  } catch (error) {
    await deleteStoredFile(body.object?.storagePath).catch(() => undefined);
    await deleteStoredFile(body.thumbnail?.storagePath).catch(() => undefined);
    const message =
      error instanceof Error && error.message.includes("Storage quota")
        ? "Storage is full. The couple needs to upgrade before more uploads can be added."
        : error instanceof Error
          ? error.message
          : "Upload could not be completed.";

    return NextResponse.json(
      { message },
      { status: 400 },
    );
  }
}
