import { describe, expect, test } from "bun:test";
import { thumbnailOutputPolicy } from "@/lib/media-thumbnails";

describe("gallery thumbnail quality", () => {
  test("keeps future uploaded previews sharp enough for the wedding gallery", () => {
    expect(thumbnailOutputPolicy).toEqual({
      size: 1024,
      maxBytes: 1024 * 1024,
      startQuality: 0.9,
      minQuality: 0.72,
    });
  });
});
