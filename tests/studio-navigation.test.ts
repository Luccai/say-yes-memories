import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { copy, type Locale } from "@/lib/i18n";

const navigationSource = readFileSync(
  new URL("../src/components/admin/StudioNavigation.tsx", import.meta.url),
  "utf8",
);
const locales: Locale[] = ["en", "es", "fr", "de", "pt", "zh"];

describe("mobile studio navigation", () => {
  test("provides compact labels in every supported language", () => {
    for (const locale of locales) {
      const admin = copy[locale].admin;
      const labels = [
        admin.mobileMemories,
        admin.mobilePresentation,
        admin.mobileWeddingPage,
        admin.mobileQrAndLink,
      ];

      for (const label of labels) {
        expect(label.trim().length).toBeGreaterThan(0);
        expect(label.length).toBeLessThanOrEqual(12);
      }
    }
  });

  test("keeps five equal tactile controls without exposing shortened accessible names", () => {
    expect(navigationSource).toContain("grid-cols-5");
    expect(navigationSource).toContain("item.mobileLabel");
    expect(navigationSource).toContain('aria-label={mode === "mobile" ? item.label : undefined}');
    expect(navigationSource).toContain("line-clamp-2");
    expect(navigationSource).toContain("min-h-16");
    expect(navigationSource).toContain("border-[rgba(139,107,63,0.16)]");
    expect(navigationSource).toContain("shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]");
  });
});
