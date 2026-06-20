import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { updateWedding } from "@/lib/supabase-store";
import { storeUploadedFile } from "@/lib/storage/storage-service";

export async function POST(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Profile media is missing." }, { status: 400 });
  }

  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return NextResponse.json(
      { message: "Profile media must be an image or video." },
      { status: 400 },
    );
  }

  const profileMedia = await storeUploadedFile(file, {
    weddingId: current.wedding.id,
    folder: "profile",
  });
  const wedding = await updateWedding(current.wedding.id, { profileMedia });
  return NextResponse.json({ wedding });
}
