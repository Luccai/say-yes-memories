import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sharedCopyButtonPath = resolve(root, "src/components/shared/CopyButton.tsx");
const copyConsumers = [
  "src/components/admin/panels/QrPanel.tsx",
  "src/components/admin/storage/PremiumExtensionDialog.tsx",
  "src/components/owner/OwnerTokensPanel.tsx",
];

describe("shared copy button", () => {
  test("keeps every clipboard action on the shared Copy to Copied control", () => {
    expect(existsSync(sharedCopyButtonPath)).toBeTrue();

    const sharedSource = readFileSync(sharedCopyButtonPath, "utf8");
    expect(sharedSource).toContain("navigator.clipboard.writeText");
    expect(sharedSource).toContain("copy-btn");
    expect(sharedSource).toContain("setTimeout");
    expect(sharedSource).toContain("1400");

    for (const consumerPath of copyConsumers) {
      const source = readFileSync(resolve(root, consumerPath), "utf8");
      expect(source, consumerPath).toContain("@/components/shared/CopyButton");
      expect(source, consumerPath).not.toContain("navigator.clipboard.writeText");
    }
  });
});
