import { describe, expect, test } from "bun:test";
import { shouldNormalizeAudioFile } from "@/lib/audio-encoding";

describe("mobile audio upload safety", () => {
  test("normalizes small WebM audio for compatibility", () => {
    const file = new File([new Uint8Array(1024)], "voice.webm", {
      type: "audio/webm",
    });
    expect(shouldNormalizeAudioFile(file)).toBe(true);
  });

  test("does not decode large audio fully into phone memory", () => {
    const file = new File([new Blob([], { type: "audio/webm" })], "voice.webm", {
      type: "audio/webm",
    });
    Object.defineProperty(file, "size", { value: 33 * 1024 * 1024 });
    expect(shouldNormalizeAudioFile(file)).toBe(false);
  });
});
