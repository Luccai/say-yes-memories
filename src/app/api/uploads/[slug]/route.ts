import { NextResponse } from "next/server";
import { addWeddingMedia, getWeddingBySlug } from "@/lib/dev-store";
import { storeUploadedFile } from "@/lib/storage/storage-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const wedding = await getWeddingBySlug(slug);

  if (!wedding) {
    return NextResponse.json({ message: "Düğün alanı bulunamadı." }, { status: 404 });
  }

  if (wedding.uploadLocked) {
    return NextResponse.json({ message: "Misafir yüklemeleri şu anda kapalı." }, { status: 403 });
  }

  const formData = await request.formData();
  const guestName = String(formData.get("guestName") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const file = formData.get("file");

  if (!guestName) {
    return NextResponse.json({ message: "İsim alanı zorunlu." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Fotoğraf, video veya ses dosyası seçin." }, { status: 400 });
  }

  if (
    !file.type.startsWith("image/") &&
    !file.type.startsWith("video/") &&
    !file.type.startsWith("audio/")
  ) {
    return NextResponse.json(
      { message: "Sadece fotoğraf, video veya ses kabul edilir." },
      { status: 400 },
    );
  }

  const object = await storeUploadedFile(file);
  const media = await addWeddingMedia({
    weddingId: wedding.id,
    guestName,
    note: note || undefined,
    object,
  });

  return NextResponse.json({ media });
}
