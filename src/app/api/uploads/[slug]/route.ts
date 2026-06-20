import { NextResponse } from "next/server";
import { addWeddingMedia, getWeddingBySlug } from "@/lib/supabase-store";
import { storeUploadedFile } from "@/lib/storage/storage-service";

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

  const formData = await request.formData();
  const guestName = String(formData.get("guestName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const file = formData.get("file");

  if (!guestName) {
    return NextResponse.json({ message: "Your name is required." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Choose a photo, video, or audio file." }, { status: 400 });
  }

  if (
    !file.type.startsWith("image/") &&
    !file.type.startsWith("video/") &&
    !file.type.startsWith("audio/")
  ) {
    return NextResponse.json(
      { message: "Only photo, video, or audio files are accepted." },
      { status: 400 },
    );
  }

  const object = await storeUploadedFile(file, {
    weddingId: wedding.id,
    folder: "guest",
  });
  const media = await addWeddingMedia({
    weddingId: wedding.id,
    guestName,
    note: note || undefined,
    object,
  });

  return NextResponse.json({ media });
}
