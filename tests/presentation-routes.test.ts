import { describe, expect, test } from "bun:test";
import type { Wedding } from "@/lib/types";
import type { PresentationMediaPage } from "@/lib/presentation/types";
import { createPresentationMediaGet } from "../src/app/api/weddings/current/presentation-media/route";
import { createPresentationContentGet } from "../src/app/api/media/[id]/content/route";

const wedding: Wedding = {
  id: "wed_presentation",
  slug: "fatma-mihail",
  studioCode: "SY-TEST-PRES",
  plan: "classic",
  storageQuotaBytes: 50 * 1024 ** 3,
  storageUsedBytes: 128,
  brideName: "Fatma",
  groomName: "Mihail",
  coupleName: "Fatma & Mihail",
  welcomeNote: "Welcome",
  uploadLocked: false,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
};

const page: PresentationMediaPage = {
  media: [
    {
      id: "asset_own",
      kind: "video",
      mimeType: "video/mp4",
      fileName: "memory.mp4",
      byteSize: 1_024,
      createdAt: "2026-07-12T01:00:00.000Z",
      guestName: "Guest",
      contentUrl: "/api/media/asset_own/content",
    },
  ],
  total: 1,
  hasMore: false,
  nextCursor: null,
};

describe("presentation routes", () => {
  test("requires a customer session before listing private media", async () => {
    const get = createPresentationMediaGet({
      getCurrentWeddingFromCookie: async () => null,
      listPresentationMediaPage: async () => page,
    });
    const response = await get(
      new Request("http://localhost/api/weddings/current/presentation-media"),
    );
    expect(response.status).toBe(401);
  });

  test("scopes the page to the session wedding and never serializes R2 internals", async () => {
    const weddingIds: string[] = [];
    const get = createPresentationMediaGet({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      listPresentationMediaPage: async (weddingId) => {
        weddingIds.push(weddingId);
        return page;
      },
    });
    const response = await get(
      new Request(
        "http://localhost/api/weddings/current/presentation-media?weddingId=wed_foreign",
      ),
    );
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(weddingIds).toEqual([wedding.id]);
    expect(body).not.toContain("storagePath");
    expect(body).not.toContain("storage_path");
    expect(body).not.toContain("r2.cloudflarestorage.com");
  });

  test("rejects a malformed pagination cursor", async () => {
    const get = createPresentationMediaGet({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      listPresentationMediaPage: async () => page,
    });
    const response = await get(
      new Request(
        "http://localhost/api/weddings/current/presentation-media?cursor=broken",
      ),
    );
    expect(response.status).toBe(400);
  });

  test("looks up content by session ownership instead of accepting a storage path", async () => {
    const lookups: Array<{ mediaId: string; weddingId: string }> = [];
    const signedPaths: string[] = [];
    const get = createPresentationContentGet({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      getPresentationMediaSource: async (mediaId, weddingId) => {
        lookups.push({ mediaId, weddingId });
        return mediaId === "asset_own"
          ? { storagePath: "weddings/wed_presentation/guest/private.mp4" }
          : null;
      },
      createSignedStorageUrl: async (storagePath) => {
        signedPaths.push(storagePath);
        return "https://signed.example/private";
      },
    });
    const response = await get(
      new Request(
        "http://localhost/api/media/asset_own/content?storagePath=weddings/wed_foreign/secret",
      ),
      { params: Promise.resolve({ id: "asset_own" }) },
    );
    expect(response.status).toBe(307);
    expect(lookups).toEqual([{ mediaId: "asset_own", weddingId: wedding.id }]);
    expect(signedPaths).toEqual(["weddings/wed_presentation/guest/private.mp4"]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  test("hides another wedding's media behind a not-found response", async () => {
    const get = createPresentationContentGet({
      getCurrentWeddingFromCookie: async () => ({ wedding }),
      getPresentationMediaSource: async () => null,
      createSignedStorageUrl: async () => "https://signed.example/private",
    });
    const response = await get(
      new Request("http://localhost/api/media/asset_foreign/content"),
      { params: Promise.resolve({ id: "asset_foreign" }) },
    );
    expect(response.status).toBe(404);
  });
});
