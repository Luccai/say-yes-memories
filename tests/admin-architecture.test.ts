import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const adminExperiencePath = resolve(
  root,
  "src/components/admin/AdminExperience.tsx",
);
const storageMeterPath = resolve(
  root,
  "src/components/admin/storage/StorageMeter.tsx",
);
const premiumDialogPath = resolve(
  root,
  "src/components/admin/storage/PremiumExtensionDialog.tsx",
);
const archiveDownloadPath = resolve(
  root,
  "src/components/admin/storage/MemoryArchiveDownload.tsx",
);

const requiredModules = [
  "src/components/admin/AdminShell.tsx",
  "src/components/admin/StudioHeader.tsx",
  "src/components/admin/panels/MemoriesPanel.tsx",
  "src/components/admin/panels/StoragePanel.tsx",
  "src/components/admin/panels/WeddingPagePanel.tsx",
  "src/components/admin/panels/QrPanel.tsx",
  "src/components/admin/memories/MemoryGrid.tsx",
  "src/components/admin/memories/MemoryCard.tsx",
  "src/components/admin/memories/MemoryLightbox.tsx",
  "src/components/admin/memories/DeleteMemoryDialog.tsx",
  "src/components/admin/storage/StorageMeter.tsx",
  "src/components/admin/storage/PremiumExtensionDialog.tsx",
  "src/components/admin/storage/MemoryArchiveDownload.tsx",
];

describe("admin component architecture", () => {
  test("keeps the requested admin modules as real files", () => {
    for (const modulePath of requiredModules) {
      expect(existsSync(resolve(root, modulePath)), modulePath).toBeTrue();
    }
  });

  test("keeps AdminExperience focused on orchestration", () => {
    const source = readFileSync(adminExperiencePath, "utf8");
    expect(source.split(/\r?\n/).length).toBeLessThan(750);
    expect(source).not.toContain("function StorageOverview");
    expect(source).not.toContain("function IdentityCard");
    expect(source).not.toContain("function QrStudio");
    expect(source).not.toContain("function MemoryInbox");
  });

  test("keeps extracted storage controls accessible on short mobile screens", () => {
    const meterSource = readFileSync(storageMeterPath, "utf8");
    const dialogSource = readFileSync(premiumDialogPath, "utf8");

    expect(meterSource).toContain('role="progressbar"');
    expect(meterSource).toContain("aria-valuenow");
    expect(meterSource).toContain("aria-label={label}");
    expect(dialogSource).toContain("max-h-[calc(100dvh-1.5rem)]");
    expect(dialogSource).toContain("overflow-y-auto");
  });

  test("lets a stalled running archive redispatch its already-reserved attempt", () => {
    const source = readFileSync(archiveDownloadPath, "utf8");
    expect(source).toContain(
      '(archive?.status === "running" && !archive.retryStartAvailable)',
    );
    expect(source).toContain("archive?.retryStartAvailable");
  });
});
