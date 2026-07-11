import { describe, expect, test } from "bun:test";
import { authCopy, copy, type Locale } from "@/lib/i18n";

const locales: Locale[] = ["en", "es", "fr", "de", "pt", "zh"];

function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => keyPaths(item, `${prefix}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) =>
      keyPaths(item, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

describe("six-language customer copy", () => {
  test("keeps the complete customer and help-copy shape equal", () => {
    const expected = keyPaths(copy.en).toSorted();
    for (const locale of locales) {
      expect(keyPaths(copy[locale]).toSorted()).toEqual(expected);
    }
  });

  test("keeps every new authentication message in all six languages", () => {
    const expected = keyPaths(authCopy.en).toSorted();
    for (const locale of locales) {
      expect(keyPaths(authCopy[locale]).toSorted()).toEqual(expected);
      for (const value of Object.values(authCopy[locale])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
