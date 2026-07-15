import { describe, expect, spyOn, test } from "bun:test";
import type { Wedding } from "@/lib/types";
import { createProfileMediaDelete } from "../src/app/api/weddings/current/profile-media/route";

const profileStoragePath =
  "weddings/wed_profile_test/profile/asset_aaaaaaaaaaaaaaaaaaaaaaaa-couple.jpg";

const wedding: Wedding = {
  id: "wed_profile_test",
  slug: "alice-bob",
  studioCode: "SY-TEST-0001",
  plan: "classic",
  storageQuotaBytes: 50 * 1024 ** 3,
  storageUsedBytes: 0,
  brideName: "Alice",
  groomName: "Bob",
  coupleName: "Alice & Bob",
  realtimeTopic: "wedding:profile-test",
  welcomeNote: "Welcome",
  uploadLocked: false,
  profileMedia: {
    id: "asset_aaaaaaaaaaaaaaaaaaaaaaaa",
    storagePath: profileStoragePath,
    url: "https://signed.example/couple.jpg",
    kind: "image",
    mimeType: "image/jpeg",
    fileName: "couple.jpg",
    byteSize: 1024,
    createdAt: "2026-07-15T00:00:00.000Z",
  },
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("profile photo removal", () => {
  test("clears the wedding record before deleting the previous R2 object", async () => {
    const calls: string[] = [];
    const handler = createProfileMediaDelete({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      clearWeddingProfileMediaIfCurrent: async (weddingId, profileMediaId) => {
        expect(weddingId).toBe(wedding.id);
        expect(profileMediaId).toBe(wedding.profileMedia!.id);
        calls.push("database");
        return { ...wedding, profileMedia: undefined };
      },
      restoreWeddingProfileMediaIfEmpty: async () => true,
      deleteStoredFile: async (storagePath) => {
        calls.push(`storage:${storagePath}`);
      },
    });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(calls).toEqual(["database", `storage:${profileStoragePath}`]);
    expect((await response.json()).wedding.profileMedia).toBeUndefined();
  });

  test("returns the unchanged wedding when there is no profile photo", async () => {
    let updateCalls = 0;
    let deleteCalls = 0;
    const weddingWithoutProfile = { ...wedding, profileMedia: undefined };
    const handler = createProfileMediaDelete({
      getCurrentWeddingFromCookie: async () => ({ wedding: weddingWithoutProfile }),
      clearWeddingProfileMediaIfCurrent: async () => {
        updateCalls += 1;
        return weddingWithoutProfile;
      },
      restoreWeddingProfileMediaIfEmpty: async () => true,
      deleteStoredFile: async () => {
        deleteCalls += 1;
      },
    });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(updateCalls).toBe(0);
    expect(deleteCalls).toBe(0);
  });

  test("restores the profile record when R2 deletion fails", async () => {
    const calls: string[] = [];
    const handler = createProfileMediaDelete({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      clearWeddingProfileMediaIfCurrent: async (_weddingId, profileMediaId) => {
        calls.push(`clear:${profileMediaId}`);
        return { ...wedding, profileMedia: undefined };
      },
      restoreWeddingProfileMediaIfEmpty: async (_weddingId, profileMedia) => {
        calls.push(`restore:${profileMedia.id}`);
        return true;
      },
      deleteStoredFile: async () => {
        throw new Error("R2 unavailable");
      },
    });

    const response = await handler();

    expect(response.status).toBe(500);
    expect(calls).toEqual([
      `clear:${wedding.profileMedia?.id}`,
      `restore:${wedding.profileMedia?.id}`,
    ]);
    expect((await response.json()).message).toBe(
      "Profile photo could not be removed.",
    );
  });

  test("does not delete or roll back when another profile replaced the expected photo", async () => {
    let deleteCalls = 0;
    let restoreCalls = 0;
    const handler = createProfileMediaDelete({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      clearWeddingProfileMediaIfCurrent: async () => null,
      restoreWeddingProfileMediaIfEmpty: async () => {
        restoreCalls += 1;
        return true;
      },
      deleteStoredFile: async () => {
        deleteCalls += 1;
      },
    });

    const response = await handler();

    expect(response.status).toBe(409);
    expect(deleteCalls).toBe(0);
    expect(restoreCalls).toBe(0);
  });

  test("does not overwrite a replacement profile when rollback loses its empty-state guard", async () => {
    let restoreCalls = 0;
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    const handler = createProfileMediaDelete({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      clearWeddingProfileMediaIfCurrent: async () => ({
        ...wedding,
        profileMedia: undefined,
      }),
      restoreWeddingProfileMediaIfEmpty: async () => {
        restoreCalls += 1;
        return false;
      },
      deleteStoredFile: async () => {
        throw new Error("R2 unavailable");
      },
    });

    const response = await handler();

    expect(response.status).toBe(500);
    expect(restoreCalls).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Profile photo metadata was not restored because the profile changed.",
    );
    errorSpy.mockRestore();
  });

  test("requires a valid customer session", async () => {
    const handler = createProfileMediaDelete({
      getCurrentWeddingFromCookie: async () => null,
      clearWeddingProfileMediaIfCurrent: async () => wedding,
      restoreWeddingProfileMediaIfEmpty: async () => true,
      deleteStoredFile: async () => undefined,
    });

    const response = await handler();

    expect(response.status).toBe(401);
  });
});
