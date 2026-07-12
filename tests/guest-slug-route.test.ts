import { describe, expect, test } from "bun:test";
import { canonicalSlugRedirect } from "@/lib/weddings/slug-routing";

describe("public wedding slug routing", () => {
  test("permanently redirects an old QR slug to the canonical address", () => {
    expect(
      canonicalSlugRedirect({
        requestedSlug: "fatma-mihail",
        canonicalSlug: "fatma-mihail-2",
        isAlias: true,
      }),
    ).toBe("fatma-mihail-2");
  });

  test("keeps a canonical address without redirecting", () => {
    expect(
      canonicalSlugRedirect({
        requestedSlug: "fatma-mihail-2",
        canonicalSlug: "fatma-mihail-2",
        isAlias: false,
      }),
    ).toBeNull();
  });
});
