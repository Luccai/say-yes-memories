import { describe, expect, test } from "bun:test";
import { shouldHandleLightboxArrow } from "@/components/admin/memories/MemoryLightbox";

describe("memory lightbox keyboard routing", () => {
  test("keeps arrow keys inside native audio and video controls", () => {
    expect(shouldHandleLightboxArrow("ArrowLeft", "AUDIO")).toBeFalse();
    expect(shouldHandleLightboxArrow("ArrowRight", "VIDEO")).toBeFalse();
    expect(shouldHandleLightboxArrow("ArrowRight", "INPUT")).toBeFalse();
  });

  test("uses arrow keys for gallery navigation elsewhere", () => {
    expect(shouldHandleLightboxArrow("ArrowLeft", "BUTTON")).toBeTrue();
    expect(shouldHandleLightboxArrow("ArrowRight", "DIV")).toBeTrue();
    expect(shouldHandleLightboxArrow("Escape", "DIV")).toBeFalse();
  });
});
