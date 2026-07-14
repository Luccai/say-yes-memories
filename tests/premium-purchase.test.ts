import { describe, expect, test } from "bun:test";
import { resolvePremiumPurchaseAction } from "@/lib/premium-purchase";

describe("Premium purchase action", () => {
  test("keeps Etsy disabled in demo even when a listing URL exists", () => {
    expect(
      resolvePremiumPurchaseAction({
        demoMode: true,
        upgradeUrl: "https://www.etsy.com/listing/example",
      }),
    ).toEqual({ kind: "demo" });
  });

  test("opens Etsy only for a real studio with a configured listing", () => {
    expect(
      resolvePremiumPurchaseAction({
        demoMode: false,
        upgradeUrl: "https://www.etsy.com/listing/example",
      }),
    ).toEqual({
      kind: "link",
      href: "https://www.etsy.com/listing/example",
    });

    expect(
      resolvePremiumPurchaseAction({ demoMode: false, upgradeUrl: undefined }),
    ).toEqual({ kind: "unavailable" });
  });
});
