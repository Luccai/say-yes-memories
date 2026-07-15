import { NextResponse } from "next/server";
import { getCurrentWeddingFromCookie } from "@/lib/auth";
import { deleteStoredFile } from "@/lib/storage/storage-service";
import {
  clearWeddingProfileMediaIfCurrent,
  restoreWeddingProfileMediaIfEmpty,
} from "@/lib/supabase-store";
import type { StoredMediaObject, Wedding } from "@/lib/types";

type ProfileMediaDeleteDependencies = {
  getCurrentWeddingFromCookie: () => Promise<{ wedding: Wedding } | null>;
  clearWeddingProfileMediaIfCurrent: (
    weddingId: string,
    expectedProfileMediaId: string,
  ) => Promise<Wedding | null>;
  restoreWeddingProfileMediaIfEmpty: (
    weddingId: string,
    profileMedia: StoredMediaObject,
  ) => Promise<boolean>;
  deleteStoredFile: (storagePath?: string | null) => Promise<void>;
};

const defaultDependencies: ProfileMediaDeleteDependencies = {
  getCurrentWeddingFromCookie,
  clearWeddingProfileMediaIfCurrent,
  restoreWeddingProfileMediaIfEmpty,
  deleteStoredFile,
};

export function createProfileMediaDelete(
  dependencies: ProfileMediaDeleteDependencies = defaultDependencies,
) {
  return async function DELETE() {
    const current = await dependencies.getCurrentWeddingFromCookie();

    if (!current) {
      return NextResponse.json({ message: "Session not found." }, { status: 401 });
    }

    const profileMedia = current.wedding.profileMedia;

    if (!profileMedia) {
      return NextResponse.json({ wedding: current.wedding });
    }

    let metadataCleared = false;

    try {
      const wedding = await dependencies.clearWeddingProfileMediaIfCurrent(
        current.wedding.id,
        profileMedia.id,
      );

      if (!wedding) {
        return NextResponse.json(
          { message: "Profile photo could not be removed." },
          { status: 409 },
        );
      }

      metadataCleared = true;
      await dependencies.deleteStoredFile(profileMedia.storagePath);

      return NextResponse.json({ wedding });
    } catch {
      if (metadataCleared) {
        try {
          const restored = await dependencies.restoreWeddingProfileMediaIfEmpty(
            current.wedding.id,
            profileMedia,
          );

          if (!restored) {
            console.error("Profile photo metadata was not restored because the profile changed.");
          }
        } catch (rollbackError) {
          console.error("Profile photo metadata could not be restored.", rollbackError);
        }
      }

      return NextResponse.json(
        { message: "Profile photo could not be removed." },
        { status: 500 },
      );
    }
  };
}

export const DELETE = createProfileMediaDelete();

export async function POST() {
  return NextResponse.json(
    { message: "Use /prepare and /complete for signed uploads." },
    { status: 410 },
  );
}
