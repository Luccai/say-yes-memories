import { NextResponse } from "next/server";
import { addWeddingMedia, getWeddingRecordBySlug } from "@/lib/supabase-store";
import {
  assertUploadBelongsToWedding,
  finalizeSignedUpload,
  type PendingStoredMediaObject,
} from "@/lib/storage/storage-service";
import { broadcastWeddingMediaChange } from "@/lib/supabase/realtime";

type CompleteUploadBody = {
  guestName?: string;
  note?: string;
  object?: PendingStoredMediaObject;
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
    const media = await addWeddingMedia({
      weddingId: wedding.id,
      guestName,
      note: note || undefined,
      object,
    });
    await broadcastWeddingMediaChange(wedding.realtimeTopic);

    return NextResponse.json({ media });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Upload could not be completed." },
      { status: 400 },
    );
  }
}
