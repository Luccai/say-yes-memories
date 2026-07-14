import { describe, expect, test } from "bun:test";
import { countMediaLibrary, sortMediaLibrary } from "@/lib/media-library";

describe("media library controls", () => {
  const items = [
    { id: "photo-old", kind: "image" as const, createdAt: "2027-06-14T19:00:00.000Z" },
    { id: "voice", kind: "audio" as const, createdAt: "2027-06-14T20:00:00.000Z" },
    { id: "video", kind: "video" as const, createdAt: "2027-06-14T21:00:00.000Z" },
    { id: "photo-new", kind: "image" as const, createdAt: "2027-06-14T22:00:00.000Z" },
  ];

  test("keeps every filter count visible even when a category is empty", () => {
    expect(countMediaLibrary(items)).toEqual({ all: 4, image: 2, video: 1, audio: 1 });
    expect(countMediaLibrary([])).toEqual({ all: 0, image: 0, video: 0, audio: 0 });
  });

  test("orders memories newest-first by default and can return to oldest-first", () => {
    expect(sortMediaLibrary(items, "newest").map((item) => item.id)).toEqual([
      "photo-new",
      "video",
      "voice",
      "photo-old",
    ]);
    expect(sortMediaLibrary(items, "oldest").map((item) => item.id)).toEqual([
      "photo-old",
      "voice",
      "video",
      "photo-new",
    ]);
  });
});
