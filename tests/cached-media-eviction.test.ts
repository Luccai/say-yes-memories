import { afterEach, describe, expect, test } from "bun:test";
import { evictCachedMedia } from "../src/components/shared/CachedMediaImage";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("cached media eviction", () => {
  test("removes instant and Cache Storage entries for only the deleted profile", async () => {
    const cacheKey = "weddings/wed_test/profile/asset_profile-couple.jpg";
    const instantKey = `sayyes.media.instant.v2.${encodeURIComponent(cacheKey)}`;
    const values = new Map<string, string>([
      [instantKey, "data:image/jpeg;base64,profile"],
      ["sayyes.media.instant.v2.other", "data:image/jpeg;base64,other"],
    ]);
    const matchingPath = `/__sayyes-media-cache/${encodeURIComponent(cacheKey)}`;
    const requests = [
      new Request(`https://sayyes.local${matchingPath}?source=first`),
      new Request(`https://sayyes.local${matchingPath}?source=second`),
      new Request("https://sayyes.local/__sayyes-media-cache/other?source=third"),
    ];
    const deletedRequests: string[] = [];
    const openedCaches: string[] = [];

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          get length() {
            return values.size;
          },
          getItem: (key: string) => values.get(key) ?? null,
          key: (index: number) => [...values.keys()][index] ?? null,
          removeItem: (key: string) => values.delete(key),
          setItem: (key: string, value: string) => values.set(key, value),
        },
        caches: {
          open: async (name: string) => {
            openedCaches.push(name);
            return {
              delete: async (request: Request) => {
                deletedRequests.push(request.url);
                return true;
              },
              keys: async () => requests,
            };
          },
        },
      },
    });

    await evictCachedMedia(cacheKey);

    expect(values.has(instantKey)).toBeFalse();
    expect(values.has("sayyes.media.instant.v2.other")).toBeTrue();
    expect(openedCaches).toEqual(["say-yes-media-v2"]);
    expect(deletedRequests).toEqual(requests.slice(0, 2).map((request) => request.url));
  });
});
