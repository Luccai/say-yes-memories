import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { updateWedding } from "@/lib/supabase-store";
import {
  assertUploadBelongsToWedding,
  deleteStoredFile,
  finalizeSignedUpload,
  type PendingStoredMediaObject,
} from "@/lib/storage/storage-service";

type CompleteProfileUploadBody = {
  object?: PendingStoredMediaObject;
};

export async function POST(request: Request) {
  const current = await getCurrentWeddingFromCookie();

  if (!current) {
    return NextResponse.json({ message: "Session not found." }, { status: 401 });
  }

  const body = (await request.json()) as CompleteProfileUploadBody;

  if (!body.object) {
    return NextResponse.json({ message: "Upload metadata is missing." }, { status: 400 });
  }

  try {
    assertUploadBelongsToWedding(body.object, {
      weddingId: current.wedding.id,
      folder: "profile",
      allowedKinds: ["image", "video"],
    });
    const profileMedia = await finalizeSignedUpload(body.object);
    const previousPath = current.wedding.profileMedia?.storagePath;
    const wedding = await updateWedding(current.wedding.id, { profileMedia });

    if (previousPath && previousPath !== profileMedia.storagePath) {
      try {
        await deleteStoredFile(previousPath);
      } catch (error) {
        console.warn("Previous profile media could not be deleted.", error);
      }
    }

    return NextResponse.json({ wedding });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Profile upload could not be completed." },
      { status: 400 },
    );
  }
}
