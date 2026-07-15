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

  test("uses the compact C-style navigation without exposing shortened accessible names", () => {
    expect(navigationSource).toContain("grid-cols-5");
    expect(navigationSource).toContain('data-mobile-navigation-style="c"');
    expect(navigationSource).toContain("item.mobileLabel");
    expect(navigationSource).toContain('aria-label={mode === "mobile" ? item.label : undefined}');
    expect(navigationSource).toContain("truncate text-center");
    expect(navigationSource).toContain("min-h-16");
    expect(navigationSource).toContain("text-[var(--ink-soft)] opacity-70");
  });

  test("keeps every desktop sidebar label at Flow mode's text weight", () => {
    expect(navigationSource).toContain('"truncate font-extrabold"');
    expect(navigationSource).toContain('<span className="truncate font-extrabold">{label}</span>');
    expect(navigationSource).toContain(
      '<span className="min-w-0 flex-1 truncate font-extrabold">{label}</span>',
    );
  });
});
