import { describe, expect, test } from "bun:test";
import { mediaCacheIdentity } from "../src/lib/media-cache";

describe("media cache identity", () => {
  test("keeps an existing thumbnail when only its signed R2 URL changes", () => {
    const cacheKey = "weddings/mary-john/thumbs/first.webp";
    const firstSignature =
      "https://r2.example.com/say-yes-memories/weddings/mary-john/thumbs/first.webp?X-Amz-Date=20260713T120000Z&X-Amz-Signature=first";
    const renewedSignature =
      "https://r2.example.com/say-yes-memories/weddings/mary-john/thumbs/first.webp?X-Amz-Date=20260713T123000Z&X-Amz-Signature=renewed";

    expect(mediaCacheIdentity(cacheKey, firstSignature)).toBe(
      mediaCacheIdentity(cacheKey, renewedSignature),
    );
  });

  test("refreshes the cache identity when the media version changes", () => {
    const cacheKey = "weddings/mary-john/thumbs/first.webp";

    expect(
      mediaCacheIdentity(cacheKey, "https://r2.example.com/thumb.webp?v=one"),
    ).not.toBe(mediaCacheIdentity(cacheKey, "https://r2.example.com/thumb.webp?v=two"));
  });
});
