import { describe, expect, test } from "bun:test";
import {
  PHOTO_DURATION_MS,
  chronologicalPresentationMedia,
  createPhotoClock,
  pausePhotoClock,
  presentationContentUrl,
  presentationFlowMedia,
  presentationShortcutTargetIsInteractive,
  previousPresentationIndex,
} from "@/lib/presentation/domain";
import {
  decodePresentationCursor,
  encodePresentationCursor,
} from "@/lib/presentation/cursor";
import type { PresentationMediaItem } from "@/lib/presentation/types";

function item(id: string, createdAt: string): PresentationMediaItem {
  return {
    id,
    kind: "image",
    mimeType: "image/jpeg",
    fileName: `${id}.jpg`,
    byteSize: 128,
    createdAt,
    guestName: "Guest",
    contentUrl: presentationContentUrl(id),
  };
}

describe("presentation domain", () => {
  test("keeps voice notes in the Flow Mode playlist", () => {
    expect(
      presentationFlowMedia([
        { id: "photo", kind: "image" as const },
        { id: "voice", kind: "audio" as const },
        { id: "video", kind: "video" as const },
      ]),
    ).toEqual([
      { id: "photo", kind: "image" },
      { id: "voice", kind: "audio" },
      { id: "video", kind: "video" },
    ]);
  });

  test("orders memories oldest-first and uses id as a stable tie-breaker", () => {
    const media = [
      item("asset_c", "2026-07-12T10:00:00.000Z"),
      item("asset_b", "2026-07-12T09:00:00.000Z"),
      item("asset_a", "2026-07-12T10:00:00.000Z"),
    ];

    expect(chronologicalPresentationMedia(media).map(({ id }) => id)).toEqual([
      "asset_b",
      "asset_a",
      "asset_c",
    ]);
    expect(media.map(({ id }) => id)).toEqual(["asset_c", "asset_b", "asset_a"]);
  });

  test("preserves the remaining part of the three-second photo window", () => {
    expect(PHOTO_DURATION_MS).toBe(3_000);
    const running = createPhotoClock(1_000, PHOTO_DURATION_MS);
    expect(pausePhotoClock(running, 2_250)).toEqual({
      remainingMs: 1_750,
      deadlineMs: null,
    });
  });

  test("does not wrap backwards into a partial catalog", () => {
    expect(previousPresentationIndex(0, 30, true)).toBe(0);
    expect(previousPresentationIndex(0, 30, false)).toBe(29);
    expect(previousPresentationIndex(7, 30, true)).toBe(6);
  });

  test("uses only an opaque same-origin content address in the client DTO", () => {
    expect(presentationContentUrl("asset_a/b")).toBe(
      "/api/media/asset_a%2Fb/content",
    );
  });

  test("ignores global shortcuts while an interactive control owns focus", () => {
    expect(presentationShortcutTargetIsInteractive({ tagName: "BUTTON" })).toBe(true);
    expect(presentationShortcutTargetIsInteractive({ tagName: "DIV", role: "button" })).toBe(
      true,
    );
    expect(
      presentationShortcutTargetIsInteractive({ tagName: "DIV", isContentEditable: true }),
    ).toBe(true);
    expect(presentationShortcutTargetIsInteractive({ tagName: "MAIN" })).toBe(false);
  });

  test("round-trips a strict chronological cursor and rejects tampering", () => {
    const cursor = {
      createdAt: "2026-07-12T10:00:00.000Z",
      id: "asset_abc-123",
    };
    expect(decodePresentationCursor(encodePresentationCursor(cursor))).toEqual(cursor);
    expect(() => decodePresentationCursor("not-a-cursor")).toThrow(
      "Invalid presentation cursor.",
    );
  });
});
