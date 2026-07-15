import { describe, expect, test } from "bun:test";
import { buttonStyles } from "@/components/shared/Button";

describe("button semantics", () => {
  test("gives Premium its own champagne treatment instead of danger styling", () => {
    const premium = buttonStyles({ variant: "premium" });
    const danger = buttonStyles({ variant: "danger" });
    const destructive = buttonStyles({ variant: "destructive" });

    expect(premium).toContain("bg-[var(--champagne)]");
    expect(premium).toContain("text-[var(--ink)]");
    expect(premium).not.toContain("rosewood");
    expect(danger).toContain("rosewood");
    expect(destructive).toContain("bg-red-600");
    expect(destructive).toContain("hover:bg-red-700");
  });
});
