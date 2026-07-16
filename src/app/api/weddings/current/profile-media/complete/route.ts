import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { updateWedding } from "@/lib/supabase-store";
import {
  assertProfileUploadBelongsToWedding,
  deleteStoredFile,
  finalizeProfileSignedUpload,
  type PendingStoredMediaObject,
} from "@/lib/storage/storage-service";

type CompleteProfileUploadBody = {
  object?: PendingStoredMediaObject;
};

const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;

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
    assertProfileUploadBelongsToWedding(body.object, {
      weddingId: current.wedding.id,
      allowedKinds: ["image"],
      maxBytes: PROFILE_PHOTO_MAX_BYTES,
    });

    if (body.object.byteSize > PROFILE_PHOTO_MAX_BYTES) {
      return NextResponse.json(
        { message: "Profile photos must be 500 KB or smaller." },
        { status: 400 },
      );
    }

    const profileMedia = await finalizeProfileSignedUpload(
      body.object,
      current.wedding.id,
    );
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
    console.warn("Profile upload completion failed.", error);
    return NextResponse.json(
      { message: "Profile upload could not be completed. Please try again." },
      { status: 400 },
    );
  }
}
